import { create } from 'zustand';
import { loyaltyService } from '@/lib/loyaltyService';
import type { LoyaltySummary } from '@/types/advancedModules.types';

interface LoyaltyState {
  summary: LoyaltySummary | null;
  redeemedPoints: number;
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;

  // Actions
  loadSummary: (shopId: string) => Promise<void>;
  setRedeemedPoints: (points: number) => void;
  reset: () => void;
}

export const useLoyaltyStore = create<LoyaltyState>((set) => ({
  summary: null,
  redeemedPoints: 0,
  status: 'idle',
  error: null,

  loadSummary: async (shopId: string) => {
    if (!shopId) return;
    set({ status: 'loading', error: null });

    try {
      const summary = await loyaltyService.fetchSummary(shopId);
      set({ summary, status: 'success' });
    } catch (err: any) {
      set({ status: 'error', error: err.message || 'Failed to load loyalty rewards.' });
    }
  },

  setRedeemedPoints: (points: number) => {
    set({ redeemedPoints: Math.max(0, points) });
  },

  reset: () => {
    set({
      summary: null,
      redeemedPoints: 0,
      status: 'idle',
      error: null,
    });
  },
}));
