import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TextInput,
  Pressable,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { chatService } from '@/lib/chatService';
import { formatMoney } from '@/utils/formatMoney';
import type { ChatMessage } from '@/types/chat.types';

// WhatsApp Palette
const WA_GREEN = '#25D366';
const WA_HEADER_GREEN = '#008069';
const WA_DARK_GREEN = '#075E54';
const WA_BG_WALLPAPER = '#EFEAE2';
const WA_BUBBLE_OUT = '#E7FFDB';
const WA_BUBBLE_IN = '#FFFFFF';
const WA_TEXT_PRIMARY = '#111B21';
const WA_TEXT_MUTED = '#667781';
const WA_TICK_BLUE = '#53BDEB';
const WA_SEND_BTN = '#00A884';

export default function ChatScreen() {
  const { id, orderId, shopId, shopName } = useLocalSearchParams<{
    id?: string;
    orderId?: string;
    shopId?: string;
    shopName?: string;
  }>();
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const activeShopId = useAuthStore((s) => s.activeShopId);

  const {
    activeConversation,
    messages,
    hasMoreOlder,
    isSuspended,
    initConversation,
    loadOlderMessages,
    sendOptimisticMessage,
    retryMessage,
    unsubscribe,
  } = useChatStore();

  const [inputText, setInputText] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<{ uri: string; name?: string; size?: number } | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const effectiveShopId = shopId || activeShopId;
    await initConversation(effectiveShopId, id !== 'new' && id !== 'chat' ? id : undefined, orderId);
    setRefreshing(false);
  }, [shopId, activeShopId, id, orderId, initConversation]);

  const businessHoursInfo = chatService.checkBusinessHours();

  useEffect(() => {
    const effectiveShopId = shopId || activeShopId;
    void initConversation(effectiveShopId, id !== 'new' && id !== 'chat' ? id : undefined, orderId);
    return () => {
      unsubscribe();
      void useChatStore.getState().markRead();
    };
  }, [activeShopId, shopId, id, orderId, initConversation, unsubscribe]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });
    return () => unsub();
  }, []);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handlePickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const MAX_SIZE = 5 * 1024 * 1024;
        if (asset.fileSize && asset.fileSize > MAX_SIZE) {
          Alert.alert('File Too Large', 'Please select an image smaller than 5 MB.');
          return;
        }

        setSelectedPhoto({
          uri: asset.uri,
          name: asset.fileName || 'chat_image.jpg',
          size: asset.fileSize,
        });
      }
    } catch {
      Alert.alert('Access Error', 'Could not open photo gallery.');
    }
  };

  const handleSend = async () => {
    const textToSend = inputText.trim();
    if (!textToSend && !selectedPhoto) return;

    if (isSuspended) {
      Alert.alert('Suspended', 'Your account is suspended. Message sending is blocked.');
      return;
    }

    const photoToSend = selectedPhoto;
    setInputText('');
    setSelectedPhoto(null);

    await sendOptimisticMessage(textToSend, photoToSend);
  };

  const userRole = (profile?.role as string) || '';
  const isWholesaler =
    userRole === 'owner' ||
    userRole === 'manager' ||
    userRole === 'wholesaler' ||
    userRole === 'admin' ||
    userRole === 'seller';

  const screenTitle = activeConversation?.shopName
    ? activeConversation.shopName
    : shopName
    ? shopName
    : isWholesaler
    ? 'Customer Shop'
    : 'Distributor Support';

  const initialLetter = (screenTitle.trim()[0] || 'C').toUpperCase();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/messages');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={WA_DARK_GREEN} />

      {/* WHATSAPP CHAT HEADER */}
      <View style={styles.waHeader}>
        <Pressable onPress={handleBack} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>

        {/* Circular Avatar */}
        <View style={styles.headerAvatar}>
          <AppText style={styles.headerAvatarText}>{initialLetter}</AppText>
        </View>

        {/* Title & Subtitle */}
        <View style={styles.headerTitleCol}>
          <AppText style={styles.headerTitleText} numberOfLines={1}>
            {screenTitle}
          </AppText>
          <AppText style={styles.headerSubtitleText} numberOfLines={1}>
            {isOffline ? 'offline' : 'online'}
          </AppText>
        </View>

        {/* Right WhatsApp Call & Menu Icons */}
        <View style={styles.headerRightIcons}>
          <Pressable style={styles.headerIconBtn} hitSlop={8}>
            <Ionicons name="videocam" size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable style={styles.headerIconBtn} hitSlop={8}>
            <Ionicons name="call" size={20} color="#FFFFFF" />
          </Pressable>
          <Pressable style={styles.headerIconBtn} hitSlop={8}>
            <Ionicons name="ellipsis-vertical" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.chatArea}>
          {/* Top Context Banners */}
          <View style={styles.topBanners}>
            {/* 1. Order Context Card */}
            {activeConversation?.orderNumber && (
              <Card style={styles.orderContextCard}>
                <View style={styles.orderContextRow}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" style={{ color: WA_GREEN, fontWeight: '700' }}>
                      LINKED ORDER #{activeConversation.orderNumber}
                    </AppText>
                    {activeConversation.orderTotal !== null && (
                      <AppText variant="subtitle" style={{ fontWeight: '800', marginTop: 2 }}>
                        {formatMoney(activeConversation.orderTotal)}
                      </AppText>
                    )}
                  </View>

                  {activeConversation.orderId && (
                    <Pressable
                      style={styles.viewOrderBtn}
                      onPress={() => router.push(`/orders/${activeConversation.orderId}`)}
                    >
                      <AppText style={styles.viewOrderBtnText}>View Order →</AppText>
                    </Pressable>
                  )}
                </View>
              </Card>
            )}

            {/* 2. Out of Hours Notice */}
            {!businessHoursInfo.isOpen && (
              <View style={styles.noticeBannerWarning}>
                <AppText style={styles.noticeTextWarning}>
                  🌙 {businessHoursInfo.message}
                </AppText>
              </View>
            )}

            {/* 3. Account Suspended Notice */}
            {isSuspended && (
              <View style={styles.noticeBannerError}>
                <AppText style={styles.noticeTextError}>
                  🚫 Account Suspended: Outgoing messages are disabled.
                </AppText>
              </View>
            )}

            {/* 4. Offline Notice */}
            {isOffline && (
              <View style={styles.noticeBannerOffline}>
                <AppText style={styles.noticeTextOffline}>
                  📡 Offline: Messages will wait until network is restored.
                </AppText>
              </View>
            )}
          </View>

          {/* Messages List */}
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.messagesList}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[WA_GREEN]}
                tintColor={WA_GREEN}
              />
            }
          >
            {hasMoreOlder && (
              <View style={styles.loadOlderRow}>
                <Pressable onPress={loadOlderMessages} style={styles.loadOlderBtn}>
                  <AppText style={styles.loadOlderBtnText}>Load Older Messages</AppText>
                </Pressable>
              </View>
            )}

            {messages.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyShield}>
                  <Ionicons name="lock-closed" size={14} color="#857762" style={{ marginRight: 4 }} />
                  <AppText style={styles.emptyShieldText}>
                    Messages are end-to-end secured within Al Fajar network.
                  </AppText>
                </View>
                <AppText style={styles.emptyTitle}>Say Hello! 👋</AppText>
                <AppText style={styles.emptySubtitle}>
                  Send order inquiries, product stock requests, or delivery updates.
                </AppText>
              </View>
            ) : (
              messages.map((msg: ChatMessage) => {
                const currentUserId = session?.user?.id;
                const isMyMessage = msg.senderId
                  ? msg.senderId === currentUserId
                  : isWholesaler
                  ? msg.senderRole === 'seller'
                  : msg.senderRole === 'customer';
                const isFailed = msg.deliveryStatus === 'failed';
                const isSending = msg.deliveryStatus === 'sending';
                const isRead = Boolean(msg.readAt);

                return (
                  <View
                    key={msg.clientMsgId || msg.id}
                    style={[
                      styles.messageRow,
                      isMyMessage ? styles.messageRowRight : styles.messageRowLeft,
                    ]}
                  >
                    <View
                      style={[
                        styles.bubble,
                        isMyMessage ? styles.bubbleRight : styles.bubbleLeft,
                      ]}
                    >
                      {/* Attached Photo */}
                      {msg.attachmentPath && (
                        <Image
                          source={{ uri: msg.attachmentPath }}
                          style={styles.attachedImage}
                          resizeMode="cover"
                        />
                      )}

                      {/* Message Text */}
                      {Boolean(msg.text) && (
                        <AppText style={styles.messageText}>
                          {msg.text}
                        </AppText>
                      )}

                      {/* Footer: Timestamp & WhatsApp Blue Double Ticks */}
                      <View style={styles.bubbleFooter}>
                        <AppText style={styles.bubbleTime}>
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </AppText>

                        {isMyMessage && (
                          <View style={styles.tickContainer}>
                            {isSending && (
                              <Ionicons name="time-outline" size={12} color={WA_TEXT_MUTED} />
                            )}
                            {msg.deliveryStatus === 'sent' && (
                              <Ionicons
                                name="checkmark-done"
                                size={15}
                                color={isRead ? WA_TICK_BLUE : WA_TEXT_MUTED}
                              />
                            )}
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Failed / Retry Action */}
                    {isFailed && (
                      <Pressable
                        onPress={() => retryMessage(msg.clientMsgId)}
                        style={styles.retryBadge}
                      >
                        <AppText style={styles.retryBadgeText}>
                          ⚠️ Failed • Tap to Retry
                        </AppText>
                      </Pressable>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Photo Preview Thumbnail Bar */}
          {selectedPhoto && (
            <View style={styles.photoPreviewBar}>
              <Image source={{ uri: selectedPhoto.uri }} style={styles.previewThumb} />
              <AppText variant="caption" style={{ flex: 1, marginLeft: 8 }}>
                Photo ready to send
              </AppText>
              <Pressable onPress={() => setSelectedPhoto(null)} hitSlop={6}>
                <AppText style={styles.removePhotoText}>✕ Remove</AppText>
              </Pressable>
            </View>
          )}

          {/* WHATSAPP BOTTOM INPUT BAR */}
          <View style={styles.inputContainer}>
            {/* White Rounded Input Pill */}
            <View style={styles.inputPill}>
              <Pressable style={styles.inputIconBtn} hitSlop={6}>
                <Ionicons name="happy-outline" size={24} color={WA_TEXT_MUTED} />
              </Pressable>

              <TextInput
                style={styles.textInput}
                placeholder={isSuspended ? 'Messaging disabled' : 'Message'}
                placeholderTextColor={WA_TEXT_MUTED}
                value={inputText}
                onChangeText={setInputText}
                multiline
                editable={!isSuspended}
                maxLength={1000}
              />

              <Pressable
                onPress={handlePickPhoto}
                style={styles.inputIconBtn}
                disabled={isSuspended}
                hitSlop={6}
              >
                <Ionicons name="attach" size={24} color={WA_TEXT_MUTED} />
              </Pressable>

              <Pressable
                onPress={handlePickPhoto}
                style={styles.inputIconBtn}
                disabled={isSuspended}
                hitSlop={6}
              >
                <Ionicons name="camera-outline" size={23} color={WA_TEXT_MUTED} />
              </Pressable>
            </View>

            {/* Circular Green Send Button */}
            <Pressable
              style={[
                styles.sendBtn,
                (!inputText.trim() && !selectedPhoto) && styles.sendBtnDisabled,
              ]}
              onPress={handleSend}
              disabled={isSuspended || (!inputText.trim() && !selectedPhoto)}
            >
              <Ionicons
                name={inputText.trim() || selectedPhoto ? 'send' : 'mic'}
                size={20}
                color="#FFFFFF"
                style={{ marginLeft: inputText.trim() || selectedPhoto ? 2 : 0 }}
              />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WA_BG_WALLPAPER,
  },
  waHeader: {
    backgroundColor: WA_HEADER_GREEN,
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 20) + 8,
    paddingBottom: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  backBtn: {
    marginRight: 6,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#128C7E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  headerTitleCol: {
    flex: 1,
  },
  headerTitleText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  headerSubtitleText: {
    color: '#D1F4CC',
    fontSize: 12,
    marginTop: 1,
  },
  headerRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBtn: {
    marginLeft: 16,
  },
  chatArea: {
    flex: 1,
    backgroundColor: WA_BG_WALLPAPER,
  },
  topBanners: {
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 6,
  },
  orderContextCard: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 4,
    borderLeftColor: WA_GREEN,
  },
  orderContextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewOrderBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#E7FCE8',
  },
  viewOrderBtnText: {
    color: WA_DARK_GREEN,
    fontSize: 12,
    fontWeight: '700',
  },
  noticeBannerWarning: {
    backgroundColor: '#FEF3C7',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  noticeTextWarning: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '600',
  },
  noticeBannerError: {
    backgroundColor: '#FEE2E2',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  noticeTextError: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '700',
  },
  noticeBannerOffline: {
    backgroundColor: '#E2E8F0',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  noticeTextOffline: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  messagesList: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  loadOlderRow: {
    alignItems: 'center',
    marginBottom: 8,
  },
  loadOlderBtn: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  loadOlderBtnText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyShield: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEECD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    marginBottom: 16,
  },
  emptyShieldText: {
    fontSize: 11,
    color: '#544738',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: WA_TEXT_PRIMARY,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: WA_TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 18,
  },
  messageRow: {
    flexDirection: 'column',
    maxWidth: '82%',
    marginBottom: 4,
  },
  messageRowRight: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  messageRowLeft: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4,
    borderRadius: 8,
    elevation: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
  },
  bubbleRight: {
    backgroundColor: WA_BUBBLE_OUT,
    borderTopRightRadius: 2,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  bubbleLeft: {
    backgroundColor: WA_BUBBLE_IN,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 10,
  },
  attachedImage: {
    width: 220,
    height: 180,
    borderRadius: 6,
    marginBottom: 6,
  },
  messageText: {
    fontSize: 15,
    color: WA_TEXT_PRIMARY,
    lineHeight: 20,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: 2,
    marginLeft: 12,
  },
  bubbleTime: {
    fontSize: 11,
    color: WA_TEXT_MUTED,
    marginRight: 4,
  },
  tickContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  retryBadge: {
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#FEE2E2',
    borderRadius: 4,
  },
  retryBadgeText: {
    color: '#B91C1C',
    fontSize: 11,
    fontWeight: '700',
  },
  photoPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  previewThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  removePhotoText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'transparent',
  },
  inputPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    elevation: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    marginRight: 6,
  },
  inputIconBtn: {
    paddingHorizontal: 4,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: WA_TEXT_PRIMARY,
    maxHeight: 100,
    marginHorizontal: 6,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: WA_SEND_BTN,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  sendBtnDisabled: {
    backgroundColor: '#8696A0',
  },
});
