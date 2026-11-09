export type NotificationCategory =
  | 'orders'
  | 'delivery'
  | 'payments'
  | 'discounts'
  | 'messages'
  | 'offers';

export type NotificationType =
  | 'order_confirmed'
  | 'order_processing'
  | 'order_ready'
  | 'order_dispatched'
  | 'order_delivered'
  | 'delivery_failed'
  | 'payment_confirmed'
  | 'proof_rejected'
  | 'payment_due'
  | 'discount_decision'
  | 'cancellation_decision'
  | 'return_decision'
  | 'special_offer'
  | 'seller_message';

export interface NotificationItem {
  id: string;
  userId: string;
  shopId: string;
  type: string;
  category: NotificationCategory;
  title: string;
  body: string;
  data: {
    route?: string;
    orderId?: string;
    paymentId?: string;
    messageId?: string;
    [key: string]: any;
  };
  isCritical: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferences {
  ordersEnabled: boolean;
  deliveryEnabled: boolean;
  paymentsEnabled: boolean;
  offersEnabled: boolean;
  messagesEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // HH:MM
  quietHoursEnd: string;   // HH:MM
  timezone: string;
}

export type NotificationPermissionStatus = 'undetermined' | 'granted' | 'denied';

export interface NotificationsListResponse {
  items: NotificationItem[];
  unreadCount: number;
  hasMore: boolean;
  nextCursor: string | null;
}
