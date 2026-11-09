import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { chatService, isValidUuid } from '@/lib/chatService';
import { useAuthStore } from '@/store/authStore';
import type { ChatMessage, ConversationRecord } from '@/types/chat.types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface ChatState {
  activeConversation: ConversationRecord | null;
  messages: ChatMessage[];
  oldestCursor: string | null;
  hasMoreOlder: boolean;
  status: 'idle' | 'loading' | 'success' | 'error';
  isSuspended: boolean;
  error: string | null;
  realtimeChannel: RealtimeChannel | null;
  unreadCount: number;
  readConversationIds: string[];

  // Actions
  fetchUnreadCount: () => Promise<void>;
  setUnreadCount: (count: number) => void;
  markConversationLocallyRead: (conversationId: string, unreadInConv?: number) => void;
  initConversation: (
    shopId?: string | null,
    conversationOrOrderId?: string | null,
    explicitOrderId?: string | null
  ) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  sendOptimisticMessage: (text: string, file?: { uri: string; name?: string; size?: number } | null) => Promise<void>;
  retryMessage: (clientMsgId: string) => Promise<void>;
  handleRealtimeMessage: (rawMessage: any) => void;
  markRead: () => Promise<void>;
  subscribe: (conversationId: string) => void;
  unsubscribe: () => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  activeConversation: null,
  messages: [],
  oldestCursor: null,
  hasMoreOlder: false,
  status: 'idle',
  isSuspended: false,
  error: null,
  realtimeChannel: null,
  unreadCount: 0,
  readConversationIds: [],

  fetchUnreadCount: async () => {
    try {
      const currentUserId = useAuthStore.getState().session?.user?.id;
      if (!currentUserId) return;

      const { count, error } = await (supabase as any)
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .is('read_at', null)
        .neq('sender_id', currentUserId);

      if (!error && count !== null && count !== undefined) {
        set({ unreadCount: count });
      }
    } catch (err) {
      console.warn('[ChatStore] fetchUnreadCount warning:', err);
    }
  },

  setUnreadCount: (count: number) => {
    set({ unreadCount: Math.max(0, count) });
  },

  markConversationLocallyRead: (conversationId: string, unreadInConv?: number) => {
    if (!conversationId) return;
    const { readConversationIds, unreadCount } = get();
    const deduction = typeof unreadInConv === 'number' && unreadInConv > 0 ? unreadInConv : 0;
    if (!readConversationIds.includes(conversationId)) {
      set({
        readConversationIds: [...readConversationIds, conversationId],
        unreadCount: Math.max(0, unreadCount - deduction),
      });
    } else if (deduction > 0) {
      set({
        unreadCount: Math.max(0, unreadCount - deduction),
      });
    }
  },

  initConversation: async (
    shopId?: string | null,
    conversationOrOrderId?: string | null,
    explicitOrderId?: string | null
  ) => {
    set({ status: 'loading', error: null, isSuspended: false });

    try {
      let conv: ConversationRecord | null = null;

      // 1. If conversationOrOrderId is a valid UUID, check if it directly matches a conversation
      if (isValidUuid(conversationOrOrderId)) {
        conv = await chatService.getConversationById(conversationOrOrderId!);
      }

      // 2. If not found by conversation ID, get or create by shopId & orderId
      if (!conv) {
        const targetShopId = shopId || useAuthStore.getState().activeShopId;
        if (!targetShopId) {
          throw new Error('No shop account found to open chat.');
        }

        const potentialOrderId = explicitOrderId || (isValidUuid(conversationOrOrderId) ? conversationOrOrderId : null);
        conv = await chatService.getOrCreateConversation(targetShopId, potentialOrderId);
      }

      const res = await chatService.fetchMessages(conv.id, null, 30);

      // Invert array so newest is at bottom (oldest to newest)
      const sorted = [...res.messages].reverse();
      const oldest = res.messages.length > 0 ? res.messages[res.messages.length - 1].createdAt : null;

      set({
        activeConversation: conv,
        messages: sorted,
        oldestCursor: oldest,
        hasMoreOlder: res.hasMore,
        status: 'success',
      });

      // Mark unread messages as read
      get().markConversationLocallyRead(conv.id);
      void chatService.markMessagesRead(conv.id).then(() => {
        void get().fetchUnreadCount();
      });

      // Subscribe to realtime channel
      get().subscribe(conv.id);
    } catch (err: any) {
      if (err.message === 'ACCOUNT_SUSPENDED') {
        set({ isSuspended: true, status: 'error', error: 'Shop account is suspended.' });
      } else {
        set({ status: 'error', error: err.message || 'Failed to open chat.' });
      }
    }
  },

  loadOlderMessages: async () => {
    const { activeConversation, oldestCursor, hasMoreOlder, status, messages } = get();
    if (!activeConversation || !hasMoreOlder || status === 'loading' || !oldestCursor) return;

    try {
      const res = await chatService.fetchMessages(activeConversation.id, oldestCursor, 30);
      const olderSorted = [...res.messages].reverse();
      const newOldest = res.messages.length > 0 ? res.messages[res.messages.length - 1].createdAt : oldestCursor;

      // Deduplicate and prepend
      const existingIds = new Set(messages.map((m) => m.clientMsgId || m.id));
      const filteredOlder = olderSorted.filter((m) => !existingIds.has(m.clientMsgId) && !existingIds.has(m.id));

      set({
        messages: [...filteredOlder, ...messages],
        oldestCursor: newOldest,
        hasMoreOlder: res.hasMore,
      });
    } catch (err: any) {
      console.warn('[ChatStore] loadOlderMessages failed:', err);
    }
  },

  sendOptimisticMessage: async (text: string, file?: { uri: string; name?: string; size?: number } | null) => {
    const { activeConversation, messages } = get();
    if (!activeConversation) return;

    const clientMsgId = `client_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const profile = useAuthStore.getState().profile;
    const userRole = (profile?.role as string) || '';
    const isSeller = userRole === 'owner' || userRole === 'manager' || userRole === 'wholesaler' || userRole === 'admin' || userRole === 'seller';
    const role: 'customer' | 'seller' = isSeller ? 'seller' : 'customer';
    const currentUserId = useAuthStore.getState().session?.user?.id || null;

    // 1. Optimistic append
    const optimisticMsg: ChatMessage = {
      id: clientMsgId,
      conversationId: activeConversation.id,
      senderId: currentUserId,
      senderRole: role,
      text: text || '',
      attachmentPath: file ? file.uri : null,
      attachmentUrl: file ? file.uri : null,
      clientMsgId,
      createdAt: new Date().toISOString(),
      deliveryStatus: 'sending',
    };

    set({ messages: [...messages, optimisticMsg] });

    // 2. Perform actual send
    try {
      let uploadedAttachmentPath: string | null = null;
      if (file) {
        uploadedAttachmentPath = await chatService.uploadAttachment(activeConversation.shopId, file);
      }

      const confirmedMsg = await chatService.sendMessage(
        activeConversation.id,
        text,
        clientMsgId,
        uploadedAttachmentPath,
      );

      // Merge confirmed message by clientMsgId
      set((state) => ({
        messages: state.messages.map((m) =>
          m.clientMsgId === clientMsgId
            ? { ...confirmedMsg, deliveryStatus: 'sent' }
            : m,
        ),
      }));
    } catch (err: any) {
      // Mark as failed with Retry
      const errorStr = err.message === 'ACCOUNT_SUSPENDED'
        ? 'Account suspended: sending blocked.'
        : err.message || 'Failed to deliver message.';

      if (err.message === 'ACCOUNT_SUSPENDED') {
        set({ isSuspended: true });
      }

      set((state) => ({
        messages: state.messages.map((m) =>
          m.clientMsgId === clientMsgId
            ? { ...m, deliveryStatus: 'failed', error: errorStr }
            : m,
        ),
      }));
    }
  },

  retryMessage: async (clientMsgId: string) => {
    const { activeConversation, messages } = get();
    if (!activeConversation) return;

    const targetMsg = messages.find((m) => m.clientMsgId === clientMsgId);
    if (!targetMsg) return;

    // Set state back to sending
    set((state) => ({
      messages: state.messages.map((m) =>
        m.clientMsgId === clientMsgId
          ? { ...m, deliveryStatus: 'sending', error: null }
          : m,
      ),
    }));

    try {
      const confirmedMsg = await chatService.sendMessage(
        activeConversation.id,
        targetMsg.text || '',
        clientMsgId,
        targetMsg.attachmentPath,
      );

      set((state) => ({
        messages: state.messages.map((m) =>
          m.clientMsgId === clientMsgId
            ? { ...confirmedMsg, deliveryStatus: 'sent' }
            : m,
        ),
      }));
    } catch (err: any) {
      set((state) => ({
        messages: state.messages.map((m) =>
          m.clientMsgId === clientMsgId
            ? { ...m, deliveryStatus: 'failed', error: err.message || 'Retry failed.' }
            : m,
        ),
      }));
    }
  },

  handleRealtimeMessage: (raw: any) => {
    const { messages, activeConversation } = get();
    if (!raw || !activeConversation || raw.conversation_id !== activeConversation.id) return;

    const incoming: ChatMessage = {
      id: raw.id,
      conversationId: raw.conversation_id,
      senderId: raw.sender_id,
      senderRole: raw.sender_role,
      text: raw.text,
      attachmentPath: raw.attachment_path,
      readAt: raw.read_at,
      clientMsgId: raw.client_msg_id,
      createdAt: raw.created_at,
      deliveryStatus: 'sent',
    };

    // Deduplicate / Merge by clientMsgId or id
    const existingIndex = messages.findIndex(
      (m) => (m.clientMsgId && m.clientMsgId === incoming.clientMsgId) || m.id === incoming.id,
    );

    if (existingIndex >= 0) {
      // Update existing message in place (e.g. read_at change or confirmed id)
      const updated = [...messages];
      updated[existingIndex] = { ...updated[existingIndex], ...incoming };
      set({ messages: updated });
    } else {
      // Append new message
      set({ messages: [...messages, incoming] });
    }

    const currentUserId = useAuthStore.getState().session?.user?.id;
    if (incoming.senderId && incoming.senderId !== currentUserId) {
      void chatService.markMessagesRead(activeConversation.id);
      get().markConversationLocallyRead(activeConversation.id);
    }
  },

  markRead: async () => {
    const { activeConversation } = get();
    if (activeConversation) {
      get().markConversationLocallyRead(activeConversation.id);
      await chatService.markMessagesRead(activeConversation.id);
      await get().fetchUnreadCount();
    }
  },

  subscribe: (conversationId: string) => {
    const existing = get().realtimeChannel;
    if (existing) {
      void supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(`chat_conversation_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: any) => {
          if (payload.new) {
            get().handleRealtimeMessage(payload.new);
          }
        },
      )
      .subscribe();

    set({ realtimeChannel: channel });
  },

  unsubscribe: () => {
    const channel = get().realtimeChannel;
    if (channel) {
      void supabase.removeChannel(channel);
      set({ realtimeChannel: null });
    }
  },

  reset: () => {
    const channel = get().realtimeChannel;
    if (channel) {
      void supabase.removeChannel(channel);
    }
    set({
      activeConversation: null,
      messages: [],
      oldestCursor: null,
      hasMoreOlder: false,
      status: 'idle',
      isSuspended: false,
      error: null,
      realtimeChannel: null,
      unreadCount: 0,
      readConversationIds: [],
    });
  },
}));
