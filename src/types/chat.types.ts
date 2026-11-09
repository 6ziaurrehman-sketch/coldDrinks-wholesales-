export type MessageDeliveryStatus = 'sending' | 'sent' | 'failed';

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId?: string | null;
  senderRole: 'customer' | 'seller' | 'system';
  text?: string | null;
  attachmentPath?: string | null;
  attachmentUrl?: string | null;
  readAt?: string | null;
  clientMsgId: string;
  createdAt: string;
  deliveryStatus: MessageDeliveryStatus;
  error?: string | null;
}

export interface ConversationRecord {
  id: string;
  shopId: string;
  shopName?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  orderTotal?: number | null;
  orderStatus?: string | null;
  status: 'open' | 'closed' | 'archived';
  lastMessageAt: string;
  createdAt: string;
  createdBy?: string | null;
}
