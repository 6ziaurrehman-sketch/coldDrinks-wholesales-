import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { createAsyncSlice, type AsyncSlice } from '@/store/createAsyncSlice';
import { ordersService } from '@/lib/ordersService';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import type {
  OrderSummaryItem,
  OrderTrackingInfo,
} from '@/types/orders.types';

export interface OrdersState extends AsyncSlice {
  activeOrders: OrderSummaryItem[];
  byId: Record<string, OrderSummaryItem>;
  trackingById: Record<string, OrderTrackingInfo>;
  isRealtimeConnected: boolean;
  activeShopId: string | null;
  channel: RealtimeChannel | null;
  reconnectAttempts: number;

  // Actions
  loadActive: (shopId?: string) => Promise<void>;
  loadTracking: (orderId: string) => Promise<OrderTrackingInfo>;
  subscribe: (shopId: string) => void;
  unsubscribe: () => void;
  handleRealtimeEvent: (payload: { eventType: string; new: any; old: any }) => void;
  rescheduleDelivery: (params: {
    orderId: string;
    newDate: string;
    slotId?: string;
    notes?: string;
  }) => Promise<void>;
  cancelAfterFailedDelivery: (params: { orderId: string; reason?: string }) => Promise<void>;
  cancelOrder: (params: { orderId: string; reason?: string }) => Promise<void>;
  submitPaymentProof: (params: { orderId: string; reference: string; notes?: string }) => Promise<void>;
  reset: () => void;
}

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export const useOrdersStore = create<OrdersState>((set, get) => {
  const asyncSlice = createAsyncSlice(set as never);

  return {
    ...asyncSlice,
    activeOrders: [],
    byId: {},
    trackingById: {},
    isRealtimeConnected: false,
    activeShopId: null,
    channel: null,
    reconnectAttempts: 0,

    loadActive: async (explicitShopId?: string) => {
      const targetShopId = explicitShopId ?? useAuthStore.getState().activeShopId;
      if (!targetShopId) {
        set({ activeOrders: [], byId: {}, status: 'idle', error: null });
        return;
      }

      set({ activeShopId: targetShopId });

      await asyncSlice.run(async () => {
        const orders = await ordersService.fetchActiveOrders(targetShopId);
        const map: Record<string, OrderSummaryItem> = {};
        orders.forEach((o) => {
          map[o.id] = o;
        });

        set({
          activeOrders: orders,
          byId: map,
        });
      });
    },

    loadTracking: async (orderId: string) => {
      set({ status: 'loading', error: null });
      try {
        const tracking = await ordersService.getOrderTracking(orderId);
        set((state) => ({
          trackingById: {
            ...state.trackingById,
            [orderId]: tracking,
          },
          status: 'success',
          error: null,
        }));
        return tracking;
      } catch (err) {
        set({ status: 'error', error: err as any });
        throw err;
      }
    },

    /**
     * Idempotent Realtime Event Merger:
     * Discards events if updated_at is older than what we currently have in memory.
     * Prevents out-of-order delivery regressing state.
     */
    handleRealtimeEvent: (payload) => {
      const { new: newRow, eventType } = payload;
      if (!newRow || !newRow.id) return;

      const current = get().byId[newRow.id];

      // If we already have the order, ensure new event updated_at >= current updated_at
      if (current && current.updatedAt && newRow.updated_at) {
        const currentDate = new Date(current.updatedAt).getTime();
        const incomingDate = new Date(newRow.updated_at).getTime();
        if (incomingDate < currentDate) {
          // Out of order event: discard
          return;
        }
      }

      if (eventType === 'DELETE') {
        const nextActive = get().activeOrders.filter((o) => o.id !== newRow.id);
        const nextById = { ...get().byId };
        delete nextById[newRow.id];
        set({ activeOrders: nextActive, byId: nextById });
        return;
      }

      const updatedSummary: OrderSummaryItem = {
        id: newRow.id,
        orderNumber: newRow.order_number,
        shopId: newRow.shop_id,
        orderStatus: newRow.order_status,
        paymentStatus: newRow.payment_status,
        deliveryStatus: newRow.delivery_status,
        deliveryEta: newRow.delivery_eta || null,
        grandTotal: Number(newRow.grand_total || 0),
        createdAt: newRow.created_at,
        updatedAt: newRow.updated_at,
      };

      const isTerminal = ['delivered', 'cancelled', 'rejected'].includes(newRow.order_status);

      set((state) => {
        let nextActive: OrderSummaryItem[];
        if (isTerminal) {
          nextActive = state.activeOrders.filter((o) => o.id !== newRow.id);
        } else {
          const exists = state.activeOrders.some((o) => o.id === newRow.id);
          if (exists) {
            nextActive = state.activeOrders.map((o) => (o.id === newRow.id ? updatedSummary : o));
          } else {
            nextActive = [updatedSummary, ...state.activeOrders];
          }
        }

        // Also if we have detailed tracking open for this order, refresh it in background
        if (state.trackingById[newRow.id]) {
          void ordersService.getOrderTracking(newRow.id).then((fresh) => {
            set((innerState) => ({
              trackingById: {
                ...innerState.trackingById,
                [newRow.id]: fresh,
              },
            }));
          });
        }

        return {
          byId: {
            ...state.byId,
            [newRow.id]: updatedSummary,
          },
          activeOrders: nextActive,
        };
      });
    },

    subscribe: (shopId: string) => {
      // Unsubscribe any previous channel
      get().unsubscribe();

      set({ activeShopId: shopId, reconnectAttempts: 0 });

      const setupChannel = () => {
        const channelName = `shop_orders_${shopId}`;
        const newChannel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'orders',
              filter: `shop_id=eq.${shopId}`,
            },
            (payload) => {
              get().handleRealtimeEvent(payload as any);
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              set({ isRealtimeConnected: true, reconnectAttempts: 0 });
              // On successful connection/reconnection: full refetch to cover any missed events
              void get().loadActive(shopId);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              set({ isRealtimeConnected: false });
              // Exponential backoff reconnect
              const attempts = get().reconnectAttempts + 1;
              const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
              set({ reconnectAttempts: attempts });

              if (reconnectTimer) clearTimeout(reconnectTimer);
              reconnectTimer = setTimeout(() => {
                if (get().activeShopId === shopId) {
                  setupChannel();
                }
              }, delay);
            }
          });

        set({ channel: newChannel });
      };

      setupChannel();
    },

    unsubscribe: () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      const existingChannel = get().channel;
      if (existingChannel) {
        void supabase.removeChannel(existingChannel);
      }

      set({ channel: null, isRealtimeConnected: false });
    },

    rescheduleDelivery: async (params) => {
      await ordersService.rescheduleDelivery(params);
      await get().loadTracking(params.orderId);
    },

    cancelAfterFailedDelivery: async (params) => {
      await ordersService.cancelAfterFailedDelivery(params);
      await get().loadTracking(params.orderId);
    },

    cancelOrder: async (params) => {
      await ordersService.cancelOrder(params);
      await get().loadTracking(params.orderId);
    },

    submitPaymentProof: async (params) => {
      await ordersService.submitPaymentProof(params);
      await get().loadTracking(params.orderId);
    },

    reset: () => {
      get().unsubscribe();
      set({
        activeOrders: [],
        byId: {},
        trackingById: {},
        isRealtimeConnected: false,
        activeShopId: null,
        channel: null,
        reconnectAttempts: 0,
        status: 'idle',
        error: null,
      });
    },
  };
});
