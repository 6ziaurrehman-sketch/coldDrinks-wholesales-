import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/theme/useTheme';
import { supabase } from '@/lib/supabase';

export interface ChatShopItem {
  id: string; // conversation_id
  shop_id: string;
  shop_name: string;
  shop_phone: string | null;
  last_message_at: string;
  last_text?: string;
  unread_count?: number;
}

interface ChatMessageItem {
  id: string;
  conversation_id: string;
  sender_role: 'customer' | 'seller' | 'system';
  text: string;
  created_at: string;
}

interface WholesalerChatModalProps {
  visible: boolean;
  onClose: () => void;
  initialShopId?: string;
}

export function WholesalerChatModal({
  visible,
  onClose,
  initialShopId,
}: WholesalerChatModalProps) {
  const { colors, spacing } = useTheme();

  const [conversations, setConversations] = useState<ChatShopItem[]>([]);
  const [selectedConv, setSelectedConv] = useState<ChatShopItem | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const flatListRef = useRef<FlatList>(null);

  // Load conversations from shops
  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch conversations with shops
      const { data: convData, error: convErr } = await (supabase as any)
        .from('conversations')
        .select(`
          id,
          shop_id,
          status,
          last_message_at,
          shop:shops(id, name, phone)
        `)
        .order('last_message_at', { ascending: false });

      if (convErr) throw convErr;

      // 2. Fetch shops that might not have conversations yet
      const { data: shopsData } = await (supabase as any)
        .from('shops')
        .select('id, name, phone');

      const convList: ChatShopItem[] = [];
      const shopSeen = new Set<string>();

      (convData || []).forEach((c: any) => {
        shopSeen.add(c.shop_id);
        convList.push({
          id: c.id,
          shop_id: c.shop_id,
          shop_name: c.shop?.name || 'Retail Customer',
          shop_phone: c.shop?.phone || null,
          last_message_at: c.last_message_at,
        });
      });

      // Include other shops if any
      (shopsData || []).forEach((s: any) => {
        if (!shopSeen.has(s.id)) {
          convList.push({
            id: '',
            shop_id: s.id,
            shop_name: s.name,
            shop_phone: s.phone || null,
            last_message_at: new Date().toISOString(),
          });
        }
      });

      setConversations(convList);

      if (initialShopId) {
        const found = convList.find((c) => c.shop_id === initialShopId);
        if (found) setSelectedConv(found);
      }
    } catch (e) {
      console.warn('Error loading conversations:', e);
    } finally {
      setLoading(false);
    }
  }, [initialShopId]);

  useEffect(() => {
    let ignore = false;
    if (visible) {
      (async () => {
        await Promise.resolve();
        if (!ignore) {
          void loadConversations();
        }
      })();
    }
    return () => {
      ignore = true;
    };
  }, [visible, loadConversations]);

  // Load messages when a conversation is chosen
  const loadMessages = useCallback(async (convId: string) => {
    if (!convId) {
      setMessages([]);
      return;
    }
    try {
      const { data, error } = await (supabase as any)
        .from('messages')
        .select('id, conversation_id, sender_role, text, created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      console.warn('Error loading messages:', e);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    let channel: any = null;

    if (selectedConv?.id) {
      (async () => {
        await Promise.resolve();
        if (!ignore) {
          void loadMessages(selectedConv.id);
        }
      })();

      // Realtime listener for incoming customer messages
      channel = supabase
        .channel(`wholesaler_chat_${selectedConv.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${selectedConv.id}`,
          },
          (payload) => {
            const newMsg = payload.new as ChatMessageItem;
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedConv, loadMessages]);

  const handleSelectShop = async (item: ChatShopItem) => {
    if (!item.id) {
      // Create conversation
      try {
        const { data, error } = await (supabase.rpc as any)('get_or_create_conversation', {
          p_shop_id: item.shop_id,
        });
        if (!error && data?.id) {
          const updated = { ...item, id: data.id };
          setSelectedConv(updated);
          return;
        }
      } catch {}
    }
    setSelectedConv(item);
  };

  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || !selectedConv) return;

    setSending(true);
    setInputText('');

    try {
      let convId = selectedConv.id;
      if (!convId) {
        const { data: convRes } = await (supabase.rpc as any)('get_or_create_conversation', {
          p_shop_id: selectedConv.shop_id,
        });
        convId = convRes?.id;
        setSelectedConv((prev) => (prev ? { ...prev, id: convId } : null));
      }

      const { error } = await (supabase.rpc as any)('wholesaler_send_chat_message', {
        p_conversation_id: convId,
        p_text: text,
      });

      if (error) {
        // Fallback direct insert if RPC not loaded yet
        await (supabase as any).from('messages').insert({
          conversation_id: convId,
          sender_role: 'seller',
          text,
          client_msg_id: `msg-${Date.now()}`,
        });
      }

      await loadMessages(convId);
    } catch (e) {
      console.warn('Error sending message:', e);
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      (c) => c.shop_name.toLowerCase().includes(q) || (c.shop_phone && c.shop_phone.includes(q))
    );
  }, [conversations, search]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
            {selectedConv ? (
              <View style={styles.chatHeader}>
                <Pressable onPress={() => setSelectedConv(null)} hitSlop={10} style={{ marginRight: 10 }}>
                  <Ionicons name="arrow-back" size={24} color={colors.text} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <AppText variant="subtitle" style={styles.boldText} numberOfLines={1}>
                    {selectedConv.shop_name}
                  </AppText>
                  {selectedConv.shop_phone && (
                    <AppText variant="caption" muted numberOfLines={1}>
                      {selectedConv.shop_phone}
                    </AppText>
                  )}
                </View>
              </View>
            ) : (
              <View style={styles.inboxHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="chatbubbles" size={22} color={colors.primary} style={{ marginRight: 8 }} />
                  <AppText variant="subtitle" style={styles.boldText}>
                    Customer Messages
                  </AppText>
                </View>
                <Pressable onPress={onClose} hitSlop={10}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </Pressable>
              </View>
            )}
            {selectedConv && (
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            )}
          </View>

          {/* Body */}
          {selectedConv ? (
            // Chat Message Thread
            <View style={{ flex: 1 }}>
              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ padding: 14 }}
                renderItem={({ item }) => {
                  const isSeller = item.sender_role === 'seller';
                  return (
                    <View
                      style={[
                        styles.bubbleWrapper,
                        isSeller ? styles.bubbleRight : styles.bubbleLeft,
                      ]}
                    >
                      <View
                        style={[
                          styles.bubble,
                          isSeller
                            ? { backgroundColor: colors.primary }
                            : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                        ]}
                      >
                        <AppText
                          style={[
                            styles.bubbleText,
                            { color: isSeller ? '#ffffff' : colors.text },
                          ]}
                        >
                          {item.text}
                        </AppText>
                        <AppText
                          variant="caption"
                          style={[
                            styles.timeText,
                            { color: isSeller ? 'rgba(255,255,255,0.7)' : colors.textMuted },
                          ]}
                        >
                          {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </AppText>
                      </View>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyCenter}>
                    <Ionicons name="chatbox-ellipses-outline" size={40} color={colors.textMuted} />
                    <AppText variant="caption" muted style={{ marginTop: 8 }}>
                      No messages yet with {selectedConv.shop_name}. Say hello!
                    </AppText>
                  </View>
                }
              />

              {/* Chat Input Bar */}
              <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                <TextInput
                  style={[styles.inputField, { color: colors.text, borderColor: colors.border }]}
                  placeholder="Type a message to customer..."
                  placeholderTextColor={colors.textMuted}
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                />
                <Pressable
                  style={[
                    styles.sendBtn,
                    { backgroundColor: inputText.trim() ? colors.primary : '#cbd5e1' },
                  ]}
                  onPress={handleSendMessage}
                  disabled={!inputText.trim() || sending}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Ionicons name="send" size={18} color="#ffffff" />
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            // Conversations Inbox
            <View style={{ flex: 1, padding: spacing.md }}>
              {/* Search Bar */}
              <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                  placeholder="Search retail customer..."
                  placeholderTextColor={colors.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  style={[styles.searchInput, { color: colors.text }]}
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch('')}>
                    <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>

              {loading ? (
                <View style={styles.emptyCenter}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : (
                <FlatList
                  data={filteredConversations}
                  keyExtractor={(item) => item.shop_id}
                  renderItem={({ item }) => (
                    <Pressable onPress={() => handleSelectShop(item)}>
                      <Card style={styles.shopItemCard}>
                        <View style={styles.avatarWrap}>
                          <Ionicons name="storefront" size={20} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1, marginHorizontal: 10 }}>
                          <AppText variant="body" style={styles.boldText} numberOfLines={1}>
                            {item.shop_name}
                          </AppText>
                          {item.shop_phone && (
                            <AppText variant="caption" muted numberOfLines={1}>
                              Phone: {item.shop_phone}
                            </AppText>
                          )}
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                      </Card>
                    </Pressable>
                  )}
                  ListEmptyComponent={
                    <View style={styles.emptyCenter}>
                      <Ionicons name="chatbubbles-outline" size={44} color={colors.textMuted} />
                      <AppText variant="body" muted style={{ marginTop: 8 }}>
                        No customer conversations found.
                      </AppText>
                    </View>
                  }
                />
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  container: {
    height: '92%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  inboxHeader: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  boldText: {
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  shopItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
  },
  avatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleWrapper: {
    marginVertical: 4,
    maxWidth: '80%',
  },
  bubbleRight: {
    alignSelf: 'flex-end',
  },
  bubbleLeft: {
    alignSelf: 'flex-start',
  },
  bubble: {
    padding: 10,
    borderRadius: 12,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 19,
  },
  timeText: {
    fontSize: 10,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderTopWidth: 1,
  },
  inputField: {
    flex: 1,
    minHeight: 40,
    maxHeight: 90,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    marginRight: 8,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCenter: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
