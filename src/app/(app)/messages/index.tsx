import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { supabase } from '@/lib/supabase';

// WhatsApp Brand Palette
const WA_GREEN = '#008069';
const WA_DARK_GREEN = '#075E54';
const WA_LIGHT_GREEN = '#25D366';
const WA_BG = '#FFFFFF';
const WA_SEARCH_BG = '#F0F2F5';
const WA_TEXT_PRIMARY = '#111B21';
const WA_TEXT_SECONDARY = '#667781';
const WA_TICK_BLUE = '#53BDEB';
const WA_DIVIDER = '#E9EDEF';

export interface WhatsAppConversationItem {
  id: string; // conversation_id
  shop_id: string;
  shop_name: string;
  shop_phone: string | null;
  shop_area?: string | null;
  last_message_at: string;
  last_text: string;
  last_sender_role: string;
  last_is_me: boolean;
  unread_count: number;
}

export default function WhatsAppMessagesScreen() {
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const currentUserId = session?.user?.id;
  const isWholesaler =
    (profile?.role as string) === 'owner' ||
    (profile?.role as string) === 'manager' ||
    (profile?.role as string) === 'wholesaler' ||
    (profile?.role as string) === 'admin' ||
    (profile?.role as string) === 'seller';

  const [conversations, setConversations] = useState<WhatsAppConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [showSearch, setShowSearch] = useState(false);

  const fetchUnreadCountStore = useChatStore((s) => s.fetchUnreadCount);
  const markConversationLocallyRead = useChatStore((s) => s.markConversationLocallyRead);

  // 1. Fetch conversations with unread counts and last message preview
  const loadChats = useCallback(async () => {
    try {
      // A. Fetch conversations
      const { data: convData, error: convErr } = await (supabase as any)
        .from('conversations')
        .select(`
          id,
          shop_id,
          status,
          last_message_at,
          shop:shops(id, name, phone, area)
        `)
        .order('last_message_at', { ascending: false });

      if (convErr) throw convErr;

      // B. Fetch shops to also show contacts that don't have conversations yet
      const { data: shopsData } = await (supabase as any)
        .from('shops')
        .select('id, name, phone, area')
        .order('name', { ascending: true });

      // C. Fetch all unread messages where current user was NOT sender
      const { data: unreadRows } = await (supabase as any)
        .from('messages')
        .select('conversation_id')
        .is('read_at', null)
        .neq('sender_id', currentUserId || '');

      const unreadMap = new Map<string, number>();
      (unreadRows || []).forEach((r: any) => {
        unreadMap.set(r.conversation_id, (unreadMap.get(r.conversation_id) || 0) + 1);
      });

      // D. Fetch latest message per conversation
      const { data: latestMsgs } = await (supabase as any)
        .from('messages')
        .select('conversation_id, text, attachment_path, sender_role, sender_id, created_at')
        .order('created_at', { ascending: false });

      const latestMsgMap = new Map<string, any>();
      (latestMsgs || []).forEach((m: any) => {
        if (!latestMsgMap.has(m.conversation_id)) {
          latestMsgMap.set(m.conversation_id, m);
        }
      });

      const list: WhatsAppConversationItem[] = [];
      const shopSeen = new Set<string>();
      const readConvIds = useChatStore.getState().readConversationIds;

      (convData || []).forEach((c: any) => {
        shopSeen.add(c.shop_id);
        const lastMsg = latestMsgMap.get(c.id);
        const unreadCount = readConvIds.includes(c.id) ? 0 : (unreadMap.get(c.id) || 0);
        const isMe = lastMsg
          ? lastMsg.sender_id === currentUserId || (isWholesaler ? lastMsg.sender_role === 'seller' : lastMsg.sender_role === 'customer')
          : false;

        list.push({
          id: c.id,
          shop_id: c.shop_id,
          shop_name: c.shop?.name || 'Retail Store',
          shop_phone: c.shop?.phone || null,
          shop_area: c.shop?.area || null,
          last_message_at: lastMsg?.created_at || c.last_message_at || new Date().toISOString(),
          last_text: lastMsg?.text || (lastMsg?.attachment_path ? '📷 Photo' : 'No messages yet'),
          last_sender_role: lastMsg?.sender_role || '',
          last_is_me: isMe,
          unread_count: unreadCount,
        });
      });

      // Add registered shops without conversation yet
      (shopsData || []).forEach((s: any) => {
        if (!shopSeen.has(s.id)) {
          list.push({
            id: '',
            shop_id: s.id,
            shop_name: s.name,
            shop_phone: s.phone || null,
            shop_area: s.area || null,
            last_message_at: '2000-01-01T00:00:00Z',
            last_text: 'Tap to start conversation',
            last_sender_role: '',
            last_is_me: false,
            unread_count: 0,
          });
        }
      });

      setConversations(list);
      void fetchUnreadCountStore();
    } catch (err) {
      console.warn('[WhatsAppMessagesScreen] Error loading chats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUserId, isWholesaler, fetchUnreadCountStore]);

  useEffect(() => {
    let isMounted = true;

    const initChats = async () => {
      await Promise.resolve();
      if (isMounted) {
        await loadChats();
      }
    };
    void initChats();

    // Subscribe to realtime changes on messages to keep chats updated
    const channel = supabase
      .channel('whatsapp_messages_screen_sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        () => {
          if (isMounted) {
            void loadChats();
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [loadChats]);

  // Automatically refresh chats and unread count whenever the Messages screen gains focus
  useFocusEffect(
    useCallback(() => {
      void loadChats();
      void fetchUnreadCountStore();
    }, [loadChats, fetchUnreadCountStore])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void loadChats();
  };

  // Total unread count across all chats
  const totalUnreadCount = useMemo(() => {
    return conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
  }, [conversations]);

  // Filtered and sorted list
  const { unreadList, readList } = useMemo(() => {
    let filtered = conversations;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.shop_name.toLowerCase().includes(q) ||
          (c.shop_phone && c.shop_phone.includes(q)) ||
          (c.shop_area && c.shop_area.toLowerCase().includes(q)) ||
          c.last_text.toLowerCase().includes(q)
      );
    }

    const unreads: WhatsAppConversationItem[] = [];
    const others: WhatsAppConversationItem[] = [];

    filtered.forEach((c) => {
      if (c.unread_count > 0) {
        unreads.push(c);
      } else {
        others.push(c);
      }
    });

    // Sort by latest message date descending
    unreads.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
    others.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

    return { unreadList: unreads, readList: others };
  }, [conversations, search]);

  const displayedList = useMemo(() => {
    if (activeTab === 'unread') {
      return unreadList;
    }
    // In 'all' tab, prioritize unread chats at the top!
    return [...unreadList, ...readList];
  }, [activeTab, unreadList, readList]);

  // Open conversation
  const handleOpenChat = async (item: WhatsAppConversationItem) => {
    let targetId = item.id;

    // Immediately clear badge in local state for instantaneous feedback
    if (item.id) {
      markConversationLocallyRead(item.id, item.unread_count);
    }
    setConversations((prev) =>
      prev.map((c) =>
        (c.id && c.id === item.id) || (item.shop_id && c.shop_id === item.shop_id)
          ? { ...c, unread_count: 0 }
          : c
      )
    );

    if (!targetId) {
      // Create conversation record for this shop
      try {
        const { data } = await (supabase.rpc as any)('get_or_create_conversation', {
          p_shop_id: item.shop_id,
        });
        if (data?.id) {
          targetId = data.id;
          markConversationLocallyRead(data.id, item.unread_count);
        }
      } catch {}
    }

    router.push({
      pathname: '/(app)/messages/[id]',
      params: { id: targetId || 'chat', shopId: item.shop_id },
    } as any);
  };

  const formatWhatsAppTime = (isoString?: string) => {
    if (!isoString || isoString.startsWith('2000-01-01')) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) return 'Yesterday';

    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear().toString().slice(-2)}`;
  };

  const getAvatarColor = (name: string) => {
    const colors = ['#128C7E', '#075E54', '#25D366', '#34B7F1', '#E542A3', '#F2994A', '#9B51E0', '#2F80ED'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const renderChatItem = ({ item }: { item: WhatsAppConversationItem }) => {
    const isUnread = item.unread_count > 0;
    const initial = (item.shop_name.trim()[0] || 'S').toUpperCase();
    const avatarColor = getAvatarColor(item.shop_name);
    const timeStr = formatWhatsAppTime(item.last_message_at);

    return (
      <Pressable
        style={({ pressed }) => [
          styles.chatRow,
          isUnread && styles.chatRowUnread,
          pressed && styles.chatRowPressed,
        ]}
        onPress={() => handleOpenChat(item)}
      >
        {/* Left: WhatsApp Circular Avatar */}
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
            <AppText style={styles.avatarInitial}>{initial}</AppText>
          </View>
          {isUnread && <View style={styles.avatarOnlineDot} />}
        </View>

        {/* Center: Contact Name & Last Message Snippet */}
        <View style={styles.chatDetailsCol}>
          <View style={styles.chatRowTop}>
            <AppText
              style={[styles.shopName, isUnread && styles.shopNameBold]}
              numberOfLines={1}
            >
              {item.shop_name}
            </AppText>
            {Boolean(timeStr) && (
              <AppText
                style={[styles.timestamp, isUnread && styles.timestampUnread]}
              >
                {timeStr}
              </AppText>
            )}
          </View>

          <View style={styles.chatRowBottom}>
            <View style={styles.lastMessageRow}>
              {item.last_is_me && (
                <Ionicons
                  name="checkmark-done"
                  size={15}
                  color={WA_TICK_BLUE}
                  style={{ marginRight: 3, marginTop: 1 }}
                />
              )}
              <AppText
                style={[styles.lastMessageText, isUnread && styles.lastMessageTextUnread]}
                numberOfLines={1}
              >
                {item.last_text}
              </AppText>
            </View>

            {/* Right: Green Circular Unread Badge */}
            {isUnread && (
              <View style={styles.unreadBadge}>
                <AppText style={styles.unreadBadgeText}>
                  {item.unread_count > 99 ? '99+' : item.unread_count}
                </AppText>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={WA_DARK_GREEN} />

      {/* 1. WHATSAPP HEADER */}
      <View style={styles.waHeader}>
        <View style={styles.headerLeft}>
          <Pressable
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(app)/(tabs)/orders');
              }
            }}
            hitSlop={10}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </Pressable>
          <AppText style={styles.waHeaderTitle}>WhatsApp</AppText>
        </View>

        <View style={styles.headerRight}>
          <Pressable
            onPress={() => setShowSearch((prev) => !prev)}
            hitSlop={8}
            style={styles.headerIconBtn}
          >
            <Ionicons name="search" size={22} color="#FFFFFF" />
          </Pressable>

          <Pressable
            onPress={onRefresh}
            hitSlop={8}
            style={styles.headerIconBtn}
          >
            <Ionicons name="sync" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {/* 2. SEARCH BAR (COLLAPSIBLE / EXPANDABLE) */}
      {showSearch && (
        <View style={styles.searchBarWrap}>
          <View style={styles.searchInputBox}>
            <Ionicons name="search" size={18} color={WA_TEXT_SECONDARY} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search chats or shops..."
              placeholderTextColor={WA_TEXT_SECONDARY}
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={WA_TEXT_SECONDARY} />
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* 3. WHATSAPP FILTER CHIPS (All | Unread) */}
      <View style={styles.filterChipsRow}>
        <Pressable
          style={[styles.filterChip, activeTab === 'all' && styles.filterChipActive]}
          onPress={() => setActiveTab('all')}
        >
          <AppText style={[styles.filterChipText, activeTab === 'all' && styles.filterChipTextActive]}>
            All
          </AppText>
        </Pressable>

        <Pressable
          style={[
            styles.filterChip,
            activeTab === 'unread' && styles.filterChipActive,
            totalUnreadCount > 0 && styles.filterChipHasUnread,
          ]}
          onPress={() => setActiveTab('unread')}
        >
          <AppText
            style={[
              styles.filterChipText,
              activeTab === 'unread' && styles.filterChipTextActive,
              totalUnreadCount > 0 && styles.filterChipTextGreen,
            ]}
          >
            Unread
          </AppText>
          {totalUnreadCount > 0 && (
            <View style={styles.filterChipBadge}>
              <AppText style={styles.filterChipBadgeText}>{totalUnreadCount}</AppText>
            </View>
          )}
        </Pressable>
      </View>

      {/* 4. CHATS LIST WITH UNREAD CHATS SECTION ABOVE */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={WA_GREEN} />
          <AppText style={styles.loadingText}>Loading chats...</AppText>
        </View>
      ) : (
        <FlatList
          data={displayedList}
          keyExtractor={(item) => item.shop_id || item.id}
          renderItem={renderChatItem}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 80 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[WA_GREEN]}
              tintColor={WA_GREEN}
            />
          }
          ListHeaderComponent={
            activeTab === 'all' && unreadList.length > 0 ? (
              <View style={styles.unreadHeaderBanner}>
                <View style={styles.unreadBannerLeft}>
                  <View style={styles.unreadBannerPill}>
                    <Ionicons name="mail-unread" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <AppText style={styles.unreadBannerPillText}>
                      UNREAD CHATS ({unreadList.length})
                    </AppText>
                  </View>
                  <AppText style={styles.unreadBannerSub}>Priority customer messages</AppText>
                </View>
                <Pressable onPress={() => setActiveTab('unread')} hitSlop={6}>
                  <AppText style={styles.filterViewText}>Filter →</AppText>
                </Pressable>
              </View>
            ) : null
          }
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="chatbubbles-outline" size={42} color={WA_GREEN} />
              </View>
              <AppText style={styles.emptyTitle}>
                {activeTab === 'unread' ? 'No unread messages' : 'No chats found'}
              </AppText>
              <AppText style={styles.emptySubtitle}>
                {activeTab === 'unread'
                  ? "You're all caught up! All customer messages are read."
                  : 'Start a new conversation with your customer retail shops.'}
              </AppText>
            </View>
          }
        />
      )}

      {/* 5. WHATSAPP FLOATING ACTION BUTTON (New Chat) */}
      <Pressable
        style={styles.fab}
        onPress={() => {
          setShowSearch(true);
        }}
        accessibilityLabel="Start New Chat"
      >
        <Ionicons name="chatbubble-ellipses" size={24} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WA_BG,
  },
  waHeader: {
    backgroundColor: WA_GREEN,
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 20) + 8,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    marginRight: 14,
  },
  waHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBtn: {
    marginLeft: 18,
  },
  searchBarWrap: {
    backgroundColor: WA_GREEN,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  searchInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: WA_TEXT_PRIMARY,
  },
  filterChipsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: WA_BG,
    borderBottomWidth: 1,
    borderBottomColor: WA_DIVIDER,
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WA_SEARCH_BG,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#D9FDD3',
  },
  filterChipHasUnread: {
    borderColor: WA_LIGHT_GREEN,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: WA_TEXT_SECONDARY,
  },
  filterChipTextActive: {
    color: WA_DARK_GREEN,
    fontWeight: '700',
  },
  filterChipTextGreen: {
    color: WA_DARK_GREEN,
  },
  filterChipBadge: {
    backgroundColor: WA_LIGHT_GREEN,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    paddingHorizontal: 4,
  },
  filterChipBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  unreadHeaderBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#DCFCE7',
  },
  unreadBannerLeft: {
    flex: 1,
  },
  unreadBannerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WA_LIGHT_GREEN,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  unreadBannerPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  unreadBannerSub: {
    fontSize: 11,
    color: '#15803D',
    marginTop: 2,
    fontWeight: '500',
  },
  filterViewText: {
    color: WA_DARK_GREEN,
    fontWeight: '700',
    fontSize: 12,
  },
  chatRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: WA_BG,
  },
  chatRowUnread: {
    backgroundColor: '#FAFCFF',
  },
  chatRowPressed: {
    backgroundColor: '#F5F6F6',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 14,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  avatarOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: WA_LIGHT_GREEN,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  chatDetailsCol: {
    flex: 1,
    justifyContent: 'center',
  },
  chatRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  shopName: {
    fontSize: 16,
    fontWeight: '600',
    color: WA_TEXT_PRIMARY,
    flex: 1,
    marginRight: 8,
  },
  shopNameBold: {
    fontWeight: '800',
  },
  timestamp: {
    fontSize: 12,
    color: WA_TEXT_SECONDARY,
    fontWeight: '500',
  },
  timestampUnread: {
    color: WA_LIGHT_GREEN,
    fontWeight: '700',
  },
  chatRowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  lastMessageText: {
    fontSize: 14,
    color: WA_TEXT_SECONDARY,
    flex: 1,
  },
  lastMessageTextUnread: {
    color: WA_TEXT_PRIMARY,
    fontWeight: '700',
  },
  unreadBadge: {
    backgroundColor: WA_LIGHT_GREEN,
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: WA_DIVIDER,
    marginLeft: 78,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: WA_TEXT_SECONDARY,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E7FCE8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WA_TEXT_PRIMARY,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: WA_TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: WA_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
  },
});
