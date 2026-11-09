import { supabase } from '@/lib/supabase';
import type { ChatMessage, ConversationRecord } from '@/types/chat.types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidUuid = (val?: string | null): boolean => {
  if (!val) return false;
  return UUID_REGEX.test(val);
};

export const chatService = {
  /**
   * Fetch conversation record directly by conversation UUID
   */
  async getConversationById(conversationId: string): Promise<ConversationRecord | null> {
    if (!isValidUuid(conversationId)) return null;

    try {
      const { data, error } = await (supabase as any)
        .from('conversations')
        .select(`
          id,
          shop_id,
          order_id,
          status,
          last_message_at,
          created_at,
          created_by,
          shop:shops(name)
        `)
        .eq('id', conversationId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      let orderNumber: string | null = null;
      let orderTotal: number | null = null;
      let orderStatus: string | null = null;

      if (data.order_id) {
        try {
          const { data: orderData } = await (supabase as any)
            .from('orders')
            .select('order_number, grand_total, status')
            .eq('id', data.order_id)
            .maybeSingle();
          if (orderData) {
            orderNumber = orderData.order_number ? String(orderData.order_number) : null;
            orderTotal = orderData.grand_total != null ? Number(orderData.grand_total) : null;
            orderStatus = orderData.status ? String(orderData.status) : null;
          }
        } catch {}
      }

      return {
        id: data.id,
        shopId: data.shop_id,
        shopName: data.shop?.name || null,
        orderId: data.order_id,
        orderNumber,
        orderTotal,
        orderStatus,
        status: data.status,
        lastMessageAt: data.last_message_at,
        createdAt: data.created_at,
        createdBy: data.created_by,
      };
    } catch {
      return null;
    }
  },

  /**
   * Fetch or initialize chat conversation (linked to order if provided)
   */
  async getOrCreateConversation(
    shopId: string,
    orderId?: string | null,
  ): Promise<ConversationRecord> {
    const validOrderId = isValidUuid(orderId) ? orderId : null;
    const { data, error } = await (supabase as any).rpc('get_or_create_conversation', {
      p_shop_id: shopId,
      p_order_id: validOrderId,
    });

    if (error) {
      throw new Error(error.message || 'Failed to start conversation with seller.');
    }

    return {
      id: data.id,
      shopId: data.shop_id,
      orderId: data.order_id,
      orderNumber: data.order_number ? String(data.order_number) : null,
      orderTotal: data.order_total !== null ? Number(data.order_total) : null,
      orderStatus: data.order_status,
      status: data.status,
      lastMessageAt: data.last_message_at,
      createdAt: data.created_at,
      createdBy: data.created_by,
    };
  },

  /**
   * Fetch messages with upward cursor pagination (loading older messages)
   */
  async fetchMessages(
    conversationId: string,
    cursor?: string | null,
    limit: number = 30,
  ): Promise<{ messages: ChatMessage[]; nextCursor: string | null; hasMore: boolean }> {
    const { data, error } = await (supabase as any).rpc('list_chat_messages', {
      p_conversation_id: conversationId,
      p_cursor: cursor || null,
      p_limit: limit,
    });

    if (error) {
      throw new Error(error.message || 'Failed to load chat messages.');
    }

    const messages: ChatMessage[] = (data?.messages || []).map((row: any) => ({
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      senderRole: row.sender_role,
      text: row.text,
      attachmentPath: row.attachment_path,
      readAt: row.read_at,
      clientMsgId: row.client_msg_id,
      createdAt: row.created_at,
      deliveryStatus: 'sent',
    }));

    return {
      messages,
      nextCursor: data?.next_cursor || null,
      hasMore: Boolean(data?.has_more),
    };
  },

  /**
   * Send chat message via database RPC with deduplication
   */
  async sendMessage(
    conversationId: string,
    text: string,
    clientMsgId: string,
    attachmentPath?: string | null,
  ): Promise<ChatMessage> {
    const { data, error } = await (supabase as any).rpc('send_chat_message', {
      p_conversation_id: conversationId,
      p_text: text || null,
      p_attachment_path: attachmentPath || null,
      p_client_msg_id: clientMsgId,
    });

    if (error) {
      if (error.message?.includes('ACCOUNT_SUSPENDED')) {
        throw new Error('ACCOUNT_SUSPENDED');
      }
      throw new Error(error.message || 'Failed to send message.');
    }

    return {
      id: data.id,
      conversationId: data.conversation_id,
      senderId: data.sender_id,
      senderRole: data.sender_role,
      text: data.text,
      attachmentPath: data.attachment_path,
      readAt: data.read_at,
      clientMsgId: data.client_msg_id,
      createdAt: data.created_at,
      deliveryStatus: 'sent',
    };
  },

  /**
   * Mark messages in conversation as read for current user
   */
  async markMessagesRead(conversationId: string): Promise<void> {
    if (!isValidUuid(conversationId)) return;
    try {
      // 1. Call RPC
      await (supabase as any).rpc('mark_chat_messages_read', {
        p_conversation_id: conversationId,
      });

      // 2. Also attempt direct update for other party's messages
      const { data: userRes } = await supabase.auth.getUser();
      const currentUserId = userRes?.user?.id;
      if (currentUserId) {
        await (supabase as any)
          .from('messages')
          .update({ read_at: new Date().toISOString() })
          .eq('conversation_id', conversationId)
          .neq('sender_id', currentUserId)
          .is('read_at', null);
      }
    } catch (err) {
      console.warn('[chatService] markMessagesRead warning:', err);
    }
  },

  /**
   * Upload chat photo attachment to private bucket
   */
  async uploadAttachment(
    shopId: string,
    file: { uri: string; name?: string; size?: number },
  ): Promise<string> {
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size && file.size > MAX_SIZE) {
      throw new Error('FILE_TOO_LARGE: Image cannot exceed 5 MB.');
    }

    const ext = file.name?.split('.').pop() || 'jpg';
    const filePath = `${shopId}/chat/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

    const res = await fetch(file.uri);
    const blob = await res.blob();

    const { error } = await supabase.storage
      .from('chat-attachments')
      .upload(filePath, blob, {
        contentType: blob.type || 'image/jpeg',
        upsert: false,
      });

    if (error) {
      throw new Error(error.message || 'Failed to upload photo attachment.');
    }

    return filePath;
  },

  /**
   * Business hours in Asia/Karachi (09:00 - 18:00 PKT Mon-Sat)
   */
  checkBusinessHours(): { isOpen: boolean; message: string } {
    const now = new Date();
    // Offset +5 hours for Asia/Karachi
    const pkt = new Date(now.getTime() + 5 * 3600 * 1000);
    const day = pkt.getUTCDay(); // 0 = Sun
    const hour = pkt.getUTCHours();
    const minute = pkt.getUTCMinutes();
    const currentTime = hour + minute / 60;

    const isSunday = day === 0;
    const isWorkingHours = currentTime >= 9 && currentTime < 18;

    if (isSunday || !isWorkingHours) {
      return {
        isOpen: false,
        message: 'Currently outside business hours (Mon-Sat 9 AM - 6 PM PKT). Seller will respond in ~1-2 hours next business morning.',
      };
    }

    return {
      isOpen: true,
      message: 'Seller typically responds within 15-30 minutes.',
    };
  },
};
