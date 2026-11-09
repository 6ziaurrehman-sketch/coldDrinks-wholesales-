import { create } from 'zustand';
import { promotionsService } from '@/lib/promotionsService';
import type { AppliedPromotion, Promotion } from '@/types/advancedModules.types';

interface PromotionsState {
  promotions: Promotion[];
  appliedPromotions: AppliedPromotion[];
  totalDiscount: number;
  serverClockOffsetMs: number;
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;

  // Actions
  loadPromotions: (shopId: string) => Promise<void>;
  evaluateCart: (
    cartItems: { variantId: string; brand?: string; categoryId?: string; price: number; quantity: number }[],
    subtotal: number,
  ) => void;
  reset: () => void;
}

export const usePromotionsStore = create<PromotionsState>((set, get) => ({
  promotions: [],
  appliedPromotions: [],
  totalDiscount: 0,
  serverClockOffsetMs: 0,
  status: 'idle',
  error: null,

  loadPromotions: async (shopId: string) => {
    if (!shopId) return;
    set({ status: 'loading', error: null });

    try {
      const items = await promotionsService.fetchActivePromotions(shopId);

      // Compute server clock offset if serverNow provided
      let offset = 0;
      if (items.length > 0 && items[0].serverNow) {
        const serverTime = new Date(items[0].serverNow).getTime();
        offset = serverTime - Date.now();
      }

      set({
        promotions: items,
        serverClockOffsetMs: offset,
        status: 'success',
      });
    } catch (err: any) {
      set({ status: 'error', error: err.message || 'Failed to load promotions.' });
    }
  },

  evaluateCart: (cartItems, subtotal) => {
    const { promotions, serverClockOffsetMs } = get();
    const result = promotionsService.evaluateCartPromotions(
      promotions,
      cartItems,
      subtotal,
      serverClockOffsetMs,
    );

    set({
      appliedPromotions: result.appliedPromotions,
      totalDiscount: result.totalDiscount,
    });
  },

  reset: () => {
    set({
      promotions: [],
      appliedPromotions: [],
      totalDiscount: 0,
      serverClockOffsetMs: 0,
      status: 'idle',
      error: null,
    });
  },
}));
