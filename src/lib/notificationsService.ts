import { supabase } from '@/lib/supabase';
import { mapSupabaseError } from '@/lib/errors';
import type {
  NotificationItem,
  NotificationPreferences,
  NotificationsListResponse,
} from '@/types/notifications.types';

export class NotificationsService {
  /**
   * Register or reassign device token on login
   */
  async registerDeviceToken(token: string, platform: 'ios' | 'android' | 'web'): Promise<void> {
    try {
      const { error } = await (supabase.rpc as any)('register_device_token', {
        p_token: token,
        p_platform: platform,
      });

      if (error) throw error;
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'registerDeviceToken', isWrite: true });
    }
  }

  /**
   * Unregister token on logout
   */
  async unregisterDeviceToken(token: string): Promise<void> {
    try {
      const { error } = await (supabase.rpc as any)('unregister_device_token', {
        p_token: token,
      });

      if (error) throw error;
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'unregisterDeviceToken', isWrite: true });
    }
  }

  /**
   * Fetch paginated notifications and live unread count
   */
  async fetchNotifications(
    shopId: string,
    limit: number = 30,
    cursor?: string | null,
  ): Promise<NotificationsListResponse> {
    try {
      const { data, error } = await (supabase.rpc as any)('list_notifications', {
        p_shop_id: shopId,
        p_limit: limit,
        p_cursor: cursor || null,
      });

      if (error) throw error;
      const res = data as any;

      const items: NotificationItem[] = (res.items || []).map((row: any) => ({
        id: row.id,
        userId: row.userId,
        shopId: row.shopId,
        type: row.type,
        category: row.category,
        title: row.title,
        body: row.body,
        data: row.data || {},
        isCritical: Boolean(row.isCritical),
        readAt: row.readAt,
        createdAt: row.createdAt,
      }));

      return {
        items,
        unreadCount: Number(res.unreadCount || 0),
        hasMore: Boolean(res.hasMore),
        nextCursor: res.nextCursor || null,
      };
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'fetchNotifications' });
    }
  }

  /**
   * Mark a single notification as read
   */
  async markRead(notificationId: string): Promise<{ unreadCount: number }> {
    try {
      const { data, error } = await (supabase.rpc as any)('mark_notification_read', {
        p_notification_id: notificationId,
      });

      if (error) throw error;
      return { unreadCount: Number((data as any)?.unreadCount || 0) };
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'markRead', isWrite: true });
    }
  }

  /**
   * Mark all notifications for shop as read
   */
  async markAllRead(shopId: string): Promise<void> {
    try {
      const { error } = await (supabase.rpc as any)('mark_all_notifications_read', {
        p_shop_id: shopId,
      });

      if (error) throw error;
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'markAllRead', isWrite: true });
    }
  }

  /**
   * Fetch user notification preferences
   */
  async fetchPreferences(shopId: string): Promise<NotificationPreferences> {
    try {
      const { data, error } = await (supabase.rpc as any)('get_notification_preferences', {
        p_shop_id: shopId,
      });

      if (error) throw error;
      const res = data as any;

      return {
        ordersEnabled: Boolean(res.ordersEnabled),
        deliveryEnabled: Boolean(res.deliveryEnabled),
        paymentsEnabled: Boolean(res.paymentsEnabled),
        offersEnabled: Boolean(res.offersEnabled),
        messagesEnabled: Boolean(res.messagesEnabled),
        quietHoursEnabled: Boolean(res.quietHoursEnabled),
        quietHoursStart: res.quietHoursStart || '22:00',
        quietHoursEnd: res.quietHoursEnd || '08:00',
        timezone: res.timezone || 'Asia/Karachi',
      };
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'fetchPreferences' });
    }
  }

  /**
   * Upsert notification preferences
   */
  async savePreferences(
    shopId: string,
    prefs: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    try {
      const { data, error } = await (supabase.rpc as any)('upsert_notification_preferences', {
        p_shop_id: shopId,
        p_prefs: prefs,
      });

      if (error) throw error;
      const res = data as any;

      return {
        ordersEnabled: Boolean(res.ordersEnabled),
        deliveryEnabled: Boolean(res.deliveryEnabled),
        paymentsEnabled: Boolean(res.paymentsEnabled),
        offersEnabled: Boolean(res.offersEnabled),
        messagesEnabled: Boolean(res.messagesEnabled),
        quietHoursEnabled: Boolean(res.quietHoursEnabled),
        quietHoursStart: res.quietHoursStart || '22:00',
        quietHoursEnd: res.quietHoursEnd || '08:00',
        timezone: res.timezone || 'Asia/Karachi',
      };
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'savePreferences', isWrite: true });
    }
  }

  /**
   * Resolve deep-link route based on notification data payload
   */
  resolveDeepLink(notification: NotificationItem): {
    route: string;
    params?: Record<string, any>;
    fallbackRoute: string;
  } {
    const data = notification.data || {};

    if (data.route) {
      return { route: data.route, fallbackRoute: '/(app)/(tabs)/orders' };
    }

    if (data.orderId) {
      return {
        route: `/(app)/orders/${data.orderId}`,
        params: { id: data.orderId },
        fallbackRoute: '/(app)/(tabs)/orders',
      };
    }

    if (data.paymentId) {
      return {
        route: `/(app)/payments/${data.paymentId}`,
        params: { id: data.paymentId },
        fallbackRoute: '/(app)/(tabs)/account',
      };
    }

    if (data.conversationId || data.messageId) {
      const convId = data.conversationId || data.messageId;
      return {
        route: `/(app)/messages/${convId}`,
        params: { id: convId },
        fallbackRoute: '/(app)/messages',
      };
    }

    // Default by category
    switch (notification.category) {
      case 'orders':
      case 'delivery':
        return { route: '/(app)/(tabs)/orders', fallbackRoute: '/(app)/(tabs)/orders' };
      case 'payments':
        return { route: '/(app)/(tabs)/account', fallbackRoute: '/(app)/(tabs)/account' };
      case 'messages':
        return { route: '/(app)/messages', fallbackRoute: '/(app)/messages' };
      case 'offers':
        return { route: '/(app)/(tabs)/catalog', fallbackRoute: '/(app)/(tabs)/catalog' };
      default:
        return { route: '/(app)/(tabs)', fallbackRoute: '/(app)/(tabs)' };
    }
  }
}

export const notificationsService = new NotificationsService();
