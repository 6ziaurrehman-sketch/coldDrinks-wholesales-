import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { cancellationService } from '@/lib/cancellationService';
import { supabase } from '@/lib/supabase';
import { useOrdersStore } from '@/store/ordersStore';
import type {
  CancellationPreview,
  CancellationRequest,
  CancellationResult,
} from '@/types/cancellation.types';

interface CancellationState {
  requestsByOrder: Record<string, CancellationRequest>;
  previewsByOrder: Record<string, CancellationPreview>;
  loading: boolean;
  submitting: boolean;
  error: string | null;
  lastResult: CancellationResult | null;
  activeShopId: string | null;

  previewCancellation: (orderId: string) => Promise<CancellationPreview>;
  submitCancellation: (
    orderId: string,
    reason: string,
    idempotencyKey?: string,
  ) => Promise<CancellationResult>;
  loadRequests: (shopId: string, orderId?: string) => Promise<void>;
  subscribe: (shopId: string) => () => void;
  resetLastResult: () => void;
  clearPreview: (orderId: string) => void;
  reset: () => void;
}

let channel: RealtimeChannel | null = null;

export const useCancellationStore = create<CancellationState>((set, get) => ({
  requestsByOrder: {},
  previewsByOrder: {},
  loading: false,
  submitting: false,
  error: null,
  lastResult: null,
  activeShopId: null,

  previewCancellation: async (orderId: string) => {
    set({ loading: true, error: null });
    try {
      const preview = await cancellationService.previewCancellation(orderId);
      set((state) => ({
        previewsByOrder: {
          ...state.previewsByOrder,
          [orderId]: preview,
        },
        loading: false,
      }));
      return preview;
    } catch (err: any) {
      const msg = err?.message || 'Failed to preview cancellation';
      set({ error: msg, loading: false });
      throw err;
    }
  },

  submitCancellation: async (orderId: string, reason: string, idempotencyKey?: string) => {
    set({ submitting: true, error: null });
    try {
      const result = await cancellationService.cancelOrder(orderId, reason, idempotencyKey);

      set((state) => {
        const nextRequests = { ...state.requestsByOrder };
        if (result.requestId) {
          nextRequests[orderId] = {
            id: result.requestId,
            orderId,
            shopId: state.activeShopId || '',
            userId: '',
            status: 'pending',
            feeEstimate: result.feeAmount,
            reason,
            createdAt: new Date().toISOString(),
          };
        }

        // Invalidate cached preview for this order
        const nextPreviews = { ...state.previewsByOrder };
        delete nextPreviews[orderId];

        return {
          submitting: false,
          lastResult: result,
          requestsByOrder: nextRequests,
          previewsByOrder: nextPreviews,
        };
      });

      // If the order was cancelled immediately, refresh tracking / active orders in ordersStore
      if (result.outcome === 'CANCELLED') {
        const ordersState = useOrdersStore.getState();
        if (ordersState.activeShopId) {
          void ordersState.loadActive(ordersState.activeShopId);
        }
        if (ordersState.trackingById[orderId]) {
          void ordersState.loadTracking(orderId);
        }
      }

      return result;
    } catch (err: any) {
      const msg = err?.message || 'Failed to cancel order';
      set({ submitting: false, error: msg });
      throw err;
    }
  },

  loadRequests: async (shopId: string, orderId?: string) => {
    set({ loading: true, error: null });
    try {
      const requests = await cancellationService.fetchCancellationRequests(shopId, orderId);
      set((state) => {
        const map = { ...state.requestsByOrder };
        requests.forEach((req) => {
          map[req.orderId] = req;
        });
        return {
          requestsByOrder: map,
          loading: false,
          activeShopId: shopId,
        };
      });
    } catch (err: any) {
      set({ error: err?.message || 'Failed to load cancellation requests', loading: false });
    }
  },

  subscribe: (shopId: string) => {
    if (channel) {
      channel.unsubscribe();
      channel = null;
    }

    set({ activeShopId: shopId });

    const channelName = `shop_cancellations_${shopId}`;
    channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cancellation_requests',
          filter: `shop_id=eq.${shopId}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (!row) return;

          const req: CancellationRequest = {
            id: row.id,
            orderId: row.order_id,
            shopId: row.shop_id,
            userId: row.user_id,
            status: row.status,
            feeEstimate: Number(row.fee_estimate || 0),
            feeApplied: row.fee_applied !== null ? Number(row.fee_applied) : null,
            reason: row.reason,
            sellerNote: row.seller_note,
            idempotencyKey: row.idempotency_key,
            createdAt: row.created_at,
            decidedAt: row.decided_at,
            decidedBy: row.decided_by,
          };

          set((state) => ({
            requestsByOrder: {
              ...state.requestsByOrder,
              [req.orderId]: req,
            },
          }));

          // If request was approved or rejected, refresh tracking and orders
          const ordersState = useOrdersStore.getState();
          if (ordersState.trackingById[req.orderId]) {
            void ordersState.loadTracking(req.orderId);
          }
          if (row.status === 'approved' && ordersState.activeShopId) {
            void ordersState.loadActive(ordersState.activeShopId);
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

  resetLastResult: () => set({ lastResult: null, error: null }),

  clearPreview: (orderId: string) =>
    set((state) => {
      const nextPreviews = { ...state.previewsByOrder };
      delete nextPreviews[orderId];
      return { previewsByOrder: nextPreviews };
    }),

  reset: () => {
    if (channel) {
      channel.unsubscribe();
      channel = null;
    }
    set({
      requestsByOrder: {},
      previewsByOrder: {},
      loading: false,
      submitting: false,
      error: null,
      lastResult: null,
      activeShopId: null,
    });
  },
}));
