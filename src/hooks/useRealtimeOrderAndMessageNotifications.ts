import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useChatStore } from '@/store/chatStore';
import { playNotificationChime } from '@/utils/notificationSound';
import type { NotificationItem } from '@/types/notifications.types';

// Configure system notification presentation
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function setupSystemNotifications() {
  try {
    // 1. Android Notification Channel setup
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Al Fajar Orders & Messages',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#002F87',
        sound: 'default',
        enableLights: true,
        enableVibrate: true,
      });
    }

    // 2. Request System Permission (Triggers native "Allow notifications" popup)
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (err) {
    console.warn('[Notifications] Setup warning:', err);
    return false;
  }
}

export function useRealtimeOrderAndMessageNotifications() {
  const session = useAuthStore((s) => s.session);
  const currentUserId = session?.user?.id;
  const showToast = useUiStore((s) => s.showToast);
  const handleIncoming = useNotificationStore((s) => s.handleIncoming);

  // Initialize permission request & channels on mount
  useEffect(() => {
    void setupSystemNotifications();

    const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
      const data = response?.notification?.request?.content?.data;
      if (!data) return;

      if (data.conversationId) {
        router.push({
          pathname: '/(app)/messages/[id]',
          params: { id: String(data.conversationId) },
        } as any);
      } else if (data.orderId) {
        router.push('/(app)/(tabs)/orders');
      } else if (data.route) {
        router.push(data.route as any);
      }
    };

    // Cold-start notification check (when app is launched by tapping a notification)
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          handleNotificationResponse(response);
        }
      })
      .catch(() => undefined);

    // Listen to notification interactions (when user taps system tray notification)
    const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

    return () => {
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    // Fetch unread messages count on mount/login
    void useChatStore.getState().fetchUnreadCount();

    // 1. REALTIME ORDER LISTENER
    const orderChannel = supabase
      .channel('global_realtime_order_notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        async (payload: any) => {
          const row = payload.new;
          if (!row) return;

          // A. NEW INCOMING ORDER (INSERT)
          if (payload.eventType === 'INSERT') {
            playNotificationChime();

            // Try to get shop name
            let shopName = 'Customer Store';
            if (row.shop_id) {
              const { data: shop } = await (supabase as any)
                .from('shops')
                .select('name, owner_name')
                .eq('id', row.shop_id)
                .single();
              if (shop?.owner_name || shop?.name) {
                shopName = shop.owner_name || shop.name;
              }
            }

            const formattedTotal = Number(row.grand_total || 0).toLocaleString();
            const orderNumStr = row.order_number ? `#${row.order_number}` : '';
            const notifTitle = `🔔 New Order ${orderNumStr} Received!`;
            const notifBody = `${shopName} • Rs. ${formattedTotal} — Tap to review`;

            // System Tray Notification
            void Notifications.scheduleNotificationAsync({
              content: {
                title: notifTitle,
                body: notifBody,
                data: { orderId: row.id },
                sound: 'default',
              },
              trigger: null,
            }).catch(() => undefined);

            // In-App Toast
            showToast({
              title: notifTitle,
              message: notifBody,
              tone: 'success',
              duration: 6000,
              onPress: () => {
                router.push('/(app)/(tabs)/orders');
              },
            });

            // Add to notification inbox store & badge
            const notifItem: NotificationItem = {
              id: `order-notif-${row.id}-${Date.now()}`,
              userId: currentUserId,
              shopId: row.shop_id || '',
              type: 'order_status',
              category: 'orders',
              title: `New Order ${orderNumStr} Received`,
              body: `Order from ${shopName} for Rs. ${formattedTotal}`,
              data: { orderId: row.id },
              isCritical: true,
              readAt: null,
              createdAt: new Date().toISOString(),
            };
            handleIncoming(notifItem);
          }

          // B. ORDER STATUS UPDATE (UPDATE)
          else if (payload.eventType === 'UPDATE') {
            const oldStatus = payload.old?.status;
            const newStatus = row.status;

            if (oldStatus && newStatus && oldStatus !== newStatus) {
              playNotificationChime();

              const orderNumStr = row.order_number ? `#${row.order_number}` : '';
              const statusDisplay = String(newStatus).replace(/_/g, ' ').toUpperCase();
              const notifTitle = `📦 Order ${orderNumStr} Status: ${statusDisplay}`;
              const notifBody = `Order status has been updated to ${statusDisplay}`;

              void Notifications.scheduleNotificationAsync({
                content: {
                  title: notifTitle,
                  body: notifBody,
                  data: { orderId: row.id, status: newStatus },
                  sound: 'default',
                },
                trigger: null,
              }).catch(() => undefined);

              showToast({
                title: notifTitle,
                message: notifBody,
                tone: newStatus === 'cancelled' ? 'error' : 'info',
                duration: 5000,
                onPress: () => {
                  router.push('/(app)/(tabs)/orders');
                },
              });

              const notifItem: NotificationItem = {
                id: `order-update-${row.id}-${Date.now()}`,
                userId: currentUserId,
                shopId: row.shop_id || '',
                type: 'order_status',
                category: 'orders',
                title: `Order ${orderNumStr} Updated`,
                body: `Status changed to ${statusDisplay}`,
                data: { orderId: row.id, status: newStatus },
                isCritical: false,
                readAt: null,
                createdAt: new Date().toISOString(),
              };
              handleIncoming(notifItem);
            }
          }
        }
      )
      .subscribe();

    // 2. REALTIME MESSAGE LISTENER
    const messageChannel = supabase
      .channel('global_realtime_message_notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        async (payload: any) => {
          void useChatStore.getState().fetchUnreadCount();

          const msg = payload.new;
          if (!msg || payload.eventType !== 'INSERT') return;

          // Don't notify the sender about their own message
          if (msg.sender_id === currentUserId) return;

          playNotificationChime();

          const senderLabel =
            msg.sender_role === 'customer'
              ? 'Customer'
              : msg.sender_role === 'seller'
              ? 'Wholesaler'
              : 'Support';

          const notifTitle = `💬 New Message from ${senderLabel}`;
          const notifBody = msg.text || 'Sent an attachment';

          // Trigger System Notification in Android status bar tray
          void Notifications.scheduleNotificationAsync({
            content: {
              title: notifTitle,
              body: notifBody,
              data: {
                conversationId: msg.conversation_id,
                senderId: msg.sender_id,
                type: 'seller_message',
              },
              sound: 'default',
            },
            trigger: null,
          }).catch(() => undefined);

          // In-App Toast
          showToast({
            title: notifTitle,
            message: notifBody,
            tone: 'info',
            duration: 6000,
            onPress: () => {
              if (msg.conversation_id) {
                router.push({
                  pathname: '/(app)/messages/[id]',
                  params: { id: String(msg.conversation_id) },
                } as any);
              } else {
                router.push('/(app)/messages');
              }
            },
          });

          // Add to notification inbox store & badge
          const notifItem: NotificationItem = {
            id: `msg-notif-${msg.id}-${Date.now()}`,
            userId: currentUserId,
            shopId: '',
            type: 'seller_message',
            category: 'messages',
            title: `Message from ${senderLabel}`,
            body: msg.text || 'New message received',
            data: { conversationId: msg.conversation_id },
            isCritical: false,
            readAt: null,
            createdAt: new Date().toISOString(),
          };
          handleIncoming(notifItem);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(orderChannel);
      supabase.removeChannel(messageChannel);
    };
  }, [currentUserId, showToast, handleIncoming]);
}
