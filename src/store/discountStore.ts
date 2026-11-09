import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { discountService } from '@/lib/discountService';
import type {
  CreateDiscountRequestInput,
  DiscountRequestRecord,
} from '@/types/discounts.types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface DiscountState {
  requestsByOrder: Record<string, DiscountRequestRecord[]>;
  activeRequestByOrder: Record<string, DiscountRequestRecord | null>;
  status: 'idle' | 'loading' | 'submitting' | 'success' | 'error';
  error: string | null;
  realtimeChannel: RealtimeChannel | null;

  // Actions
  loadRequests: (orderId: string) => Promise<void>;
  createRequest: (input: CreateDiscountRequestInput) => Promise<string>;
  withdrawRequest: (requestId: string, orderId: string) => Promise<void>;
  acceptCounter: (
    requestId: string,
    orderId: string,
  ) => Promise<{ appliedDiscount: number; newTotal: number }>;
  subscribe: (orderId: string) => void;
  unsubscribe: () => void;
  reset: () => void;
}

export const useDiscountStore = create<DiscountState>((set, get) => ({
  requestsByOrder: {},
  activeRequestByOrder: {},
  status: 'idle',
  error: null,
  realtimeChannel: null,

  loadRequests: async (orderId: string) => {
    if (!orderId) return;
    set({ status: 'loading', error: null });

    try {
      const requests = await discountService.fetchDiscountRequests(orderId);
      const active = requests.find((r) => r.status === 'pending' || r.status === 'countered') || null;

      set((state) => ({
        requestsByOrder: { ...state.requestsByOrder, [orderId]: requests },
        activeRequestByOrder: { ...state.activeRequestByOrder, [orderId]: active },
        status: 'success',
      }));
    } catch (err: any) {
      set({ status: 'error', error: err.message || 'Failed to load discount requests.' });
    }
  },

  createRequest: async (input: CreateDiscountRequestInput) => {
    set({ status: 'submitting', error: null });

    try {
      const res = await discountService.createDiscountRequest(input);
      await get().loadRequests(input.orderId);
      set({ status: 'success' });
      return res.requestId;
    } catch (err: any) {
      set({ status: 'error', error: err.message || 'Failed to create discount request.' });
      throw err;
    }
  },

  withdrawRequest: async (requestId: string, orderId: string) => {
    try {
      await discountService.withdrawDiscountRequest(requestId);
      await get().loadRequests(orderId);
    } catch (err: any) {
      set({ error: err.message || 'Failed to withdraw discount request.' });
      throw err;
    }
  },

  acceptCounter: async (requestId: string, orderId: string) => {
    try {
      const res = await discountService.acceptCounterOffer(requestId);
      await get().loadRequests(orderId);
      return res;
    } catch (err: any) {
      set({ error: err.message || 'Failed to accept counter offer.' });
      throw err;
    }
  },

  subscribe: (orderId: string) => {
    const existing = get().realtimeChannel;
    if (existing) {
      void supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(`discount_order_${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'discount_requests',
          filter: `order_id=eq.${orderId}`,
        },
        () => {
          void get().loadRequests(orderId);
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
      requestsByOrder: {},
      activeRequestByOrder: {},
      status: 'idle',
      error: null,
      realtimeChannel: null,
    });
  },
}));
