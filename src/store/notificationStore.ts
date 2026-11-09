import { create } from 'zustand';
import { router } from 'expo-router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { notificationsService } from '@/lib/notificationsService';
import { supabase } from '@/lib/supabase';
import type {
  NotificationItem,
  NotificationPreferences,
  NotificationPermissionStatus,
} from '@/types/notifications.types';

interface NotificationState {
  items: NotificationItem[];
  unreadCount: number;
  cursor: string | null;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  preferences: NotificationPreferences | null;
  permissionStatus: NotificationPermissionStatus;
  activeShopId: string | null;
  error: string | null;

  registerDevice: (token?: string, platform?: 'ios' | 'android' | 'web') => Promise<void>;
  setPermissionStatus: (status: NotificationPermissionStatus) => void;
  load: (shopId: string) => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: (shopId: string) => Promise<void>;
  updatePreferences: (
    shopId: string,
    updates: Partial<NotificationPreferences>,
  ) => Promise<void>;
  handleIncoming: (notification: NotificationItem) => void;
  handleTap: (notification: NotificationItem) => void;
  subscribe: (shopId: string, userId: string) => () => void;
  reset: () => void;
}

let channel: RealtimeChannel | null = null;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unreadCount: 0,
  cursor: null,
  hasMore: false,
  loading: false,
  loadingMore: false,
  preferences: null,
  permissionStatus: 'undetermined',
  activeShopId: null,
  error: null,

  setPermissionStatus: (status) => set({ permissionStatus: status }),

  registerDevice: async (token?: string, platform?: 'ios' | 'android' | 'web') => {
    if (!token) return;
    const targetPlatform = platform || (Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web');
    try {
      await notificationsService.registerDeviceToken(token, targetPlatform);
      set({ permissionStatus: 'granted' });
    } catch (err: any) {
      console.warn('[notificationStore] Failed to register device token:', err);
    }
  },

  load: async (shopId: string) => {
    set({ loading: true, error: null, activeShopId: shopId });
    try {
      const [res, prefs] = await Promise.all([
        notificationsService.fetchNotifications(shopId, 30),
        notificationsService.fetchPreferences(shopId).catch(() => null),
      ]);

      set({
        items: res.items,
        unreadCount: res.unreadCount,
        hasMore: res.hasMore,
        cursor: res.nextCursor,
        preferences: prefs,
        loading: false,
      });
    } catch (err: any) {
      set({
        error: err?.message || 'Failed to load notifications',
        loading: false,
      });
    }
  },

  loadMore: async () => {
    const { activeShopId, cursor, hasMore, loadingMore } = get();
    if (!activeShopId || !hasMore || !cursor || loadingMore) return;

    set({ loadingMore: true });
    try {
      const res = await notificationsService.fetchNotifications(activeShopId, 30, cursor);
      set((state) => ({
        items: [...state.items, ...res.items],
        hasMore: res.hasMore,
        cursor: res.nextCursor,
        loadingMore: false,
      }));
    } catch {
      set({ loadingMore: false });
    }
  },

  markRead: async (notificationId: string) => {
    const prevItems = get().items;
    const prevUnread = get().unreadCount;

    // Optimistic update
    set((state) => ({
      items: state.items.map((i) =>
        i.id === notificationId ? { ...i, readAt: new Date().toISOString() } : i,
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));

    try {
      const res = await notificationsService.markRead(notificationId);
      set({ unreadCount: res.unreadCount });
    } catch {
      // Rollback on network failure
      set({ items: prevItems, unreadCount: prevUnread });
    }
  },

  markAllRead: async (shopId: string) => {
    const prevItems = get().items;
    const prevUnread = get().unreadCount;

    // Optimistic update
    set((state) => ({
      items: state.items.map((i) => ({ ...i, readAt: i.readAt || new Date().toISOString() })),
      unreadCount: 0,
    }));

    try {
      await notificationsService.markAllRead(shopId);
    } catch {
      // Rollback
      set({ items: prevItems, unreadCount: prevUnread });
    }
  },

  updatePreferences: async (shopId: string, updates: Partial<NotificationPreferences>) => {
    const prev = get().preferences;
    if (prev) {
      set({ preferences: { ...prev, ...updates } });
    }

    try {
      const saved = await notificationsService.savePreferences(shopId, updates);
      set({ preferences: saved });
    } catch (err) {
      if (prev) set({ preferences: prev });
      throw err;
    }
  },

  handleIncoming: (notification: NotificationItem) => {
    set((state) => {
      // Dedupe by notification ID
      if (state.items.some((i) => i.id === notification.id)) {
        return state;
      }

      const nextItems = [notification, ...state.items];
      const nextUnread = notification.readAt ? state.unreadCount : state.unreadCount + 1;

      return {
        items: nextItems,
        unreadCount: nextUnread,
      };
    });
  },

  handleTap: (notification: NotificationItem) => {
    // Mark as read if unread
    if (!notification.readAt) {
      void get().markRead(notification.id);
    }

    // Resolve deep-link route
    const { route } = notificationsService.resolveDeepLink(notification);
    try {
      router.push(route as any);
    } catch (err) {
      console.warn('[notificationStore] Failed to route to target:', route, err);
      // Fallback
      router.push('/(app)/(tabs)/orders');
    }
  },

  subscribe: (shopId: string, userId: string) => {
    if (channel) {
      channel.unsubscribe();
      channel = null;
    }

    set({ activeShopId: shopId });

    const channelName = `user_notifications_${userId}_${shopId}`;
    channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (!row || row.shop_id !== shopId) return;

          if (payload.eventType === 'INSERT') {
            const incoming: NotificationItem = {
              id: row.id,
              userId: row.user_id,
              shopId: row.shop_id,
              type: row.type,
              category: row.category,
              title: row.title,
              body: row.body,
              data: row.data || {},
              isCritical: Boolean(row.is_critical),
              readAt: row.read_at,
              createdAt: row.created_at,
            };
            get().handleIncoming(incoming);
          } else if (payload.eventType === 'UPDATE') {
            // Update read state across devices
            set((state) => {
              const updated = state.items.map((i) =>
                i.id === row.id ? { ...i, readAt: row.read_at } : i,
              );
              const unread = updated.filter((i) => !i.readAt).length;
              return { items: updated, unreadCount: unread };
            });
          }
        },
      )
      .subscribe();

    return () => {
      if (channel) {
        channel.unsubscribe();
        channel = null;
      }
    };
  },

  reset: () => {
    if (channel) {
      channel.unsubscribe();
      channel = null;
    }
    set({
      items: [],
      unreadCount: 0,
      cursor: null,
      hasMore: false,
      loading: false,
      loadingMore: false,
      preferences: null,
      activeShopId: null,
      error: null,
    });
  },
}));
