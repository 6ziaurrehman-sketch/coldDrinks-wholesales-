import { create } from 'zustand';
import { returnService } from '@/lib/returnService';
import type {
  EligibleOrder,
  EmptiesSummary,
  ReturnItemDraft,
  ReturnRecord,
} from '@/types/returns.types';

interface ReturnsState {
  eligibleOrders: EligibleOrder[];
  selectedOrder: EligibleOrder | null;
  draftItems: Record<string, ReturnItemDraft>;
  returns: ReturnRecord[];
  emptiesSummary: EmptiesSummary | null;
  status: 'idle' | 'loading' | 'submitting' | 'success' | 'error';
  error: string | null;

  // Actions
  loadEligible: (shopId: string) => Promise<void>;
  loadReturns: (shopId: string) => Promise<void>;
  loadEmpties: (shopId: string) => Promise<void>;
  selectOrder: (order: EligibleOrder | null) => void;
  updateItemDraft: (orderItemId: string, draft: ReturnItemDraft) => void;
  removeItemDraft: (orderItemId: string) => void;
  uploadPhoto: (shopId: string, file: { uri: string; name?: string; size?: number }) => Promise<string>;
  submitReturn: (orderId: string, shopId: string) => Promise<{ returnId: string; returnNumber: string }>;
  resetDraft: () => void;
  reset: () => void;
}

export const useReturnsStore = create<ReturnsState>((set, get) => ({
  eligibleOrders: [],
  selectedOrder: null,
  draftItems: {},
  returns: [],
  emptiesSummary: null,
  status: 'idle',
  error: null,

  loadEligible: async (shopId: string) => {
    if (!shopId) return;
    set({ status: 'loading', error: null });

    try {
      const orders = await returnService.fetchEligibleOrders(shopId);
      set({ eligibleOrders: orders, status: 'success' });
    } catch (err: any) {
      set({ status: 'error', error: err.message || 'Failed to load eligible orders.' });
    }
  },

  loadReturns: async (shopId: string) => {
    if (!shopId) return;
    set({ status: 'loading', error: null });

    try {
      const returns = await returnService.fetchReturns(shopId);
      set({ returns, status: 'success' });
    } catch (err: any) {
      set({ status: 'error', error: err.message || 'Failed to load returns.' });
    }
  },

  loadEmpties: async (shopId: string) => {
    if (!shopId) return;

    try {
      const empties = await returnService.fetchEmptiesSummary(shopId);
      set({ emptiesSummary: empties });
    } catch (err: any) {
      console.warn('[ReturnsStore] loadEmpties failed:', err);
    }
  },

  selectOrder: (order: EligibleOrder | null) => {
    set({ selectedOrder: order, draftItems: {} });
  },

  updateItemDraft: (orderItemId: string, draft: ReturnItemDraft) => {
    set((state) => ({
      draftItems: {
        ...state.draftItems,
        [orderItemId]: draft,
      },
    }));
  },

  removeItemDraft: (orderItemId: string) => {
    set((state) => {
      const next = { ...state.draftItems };
      delete next[orderItemId];
      return { draftItems: next };
    });
  },

  uploadPhoto: async (shopId: string, file: { uri: string; name?: string; size?: number }) => {
    return await returnService.uploadReturnPhoto(shopId, file);
  },

  submitReturn: async (orderId: string, shopId: string) => {
    set({ status: 'submitting', error: null });

    try {
      const items = Object.values(get().draftItems);
      if (items.length === 0) {
        throw new Error('Please select at least one item to return.');
      }

      const res = await returnService.createReturnRequest(orderId, items);

      // Refresh returns and eligible list
      await Promise.all([
        get().loadReturns(shopId),
        get().loadEligible(shopId),
      ]);

      set({ draftItems: {}, selectedOrder: null, status: 'success' });
      return res;
    } catch (err: any) {
      set({ status: 'error', error: err.message || 'Failed to submit return request.' });
      throw err;
    }
  },

  resetDraft: () => {
    set({ draftItems: {}, selectedOrder: null });
  },

  reset: () => {
    set({
      eligibleOrders: [],
      selectedOrder: null,
      draftItems: {},
      returns: [],
      emptiesSummary: null,
      status: 'idle',
      error: null,
    });
  },
}));
