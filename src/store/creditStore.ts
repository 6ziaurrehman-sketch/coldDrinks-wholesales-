import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { creditService } from '@/lib/creditService';
import type {
  CreditAlertItem,
  CreditSummary,
  CustomerLedgerEntry,
} from '@/types/credit.types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface CreditState {
  summary: CreditSummary | null;
  ledgerEntries: CustomerLedgerEntry[];
  alerts: CreditAlertItem[];
  filterType: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  isOwner: boolean;
  lastLoadedAt: string | null;
  realtimeChannel: RealtimeChannel | null;

  // Actions
  loadSummary: (shopId: string) => Promise<void>;
  loadLedger: (shopId: string, filterType?: string, cursor?: string | null) => Promise<void>;
  setFilterType: (shopId: string, filterType: string) => void;
  computeAlerts: () => void;
  subscribe: (shopId: string) => void;
  unsubscribe: () => void;
  reset: () => void;
}

export const useCreditStore = create<CreditState>((set, get) => ({
  summary: null,
  ledgerEntries: [],
  alerts: [],
  filterType: 'all',
  status: 'idle',
  error: null,
  isOwner: true,
  lastLoadedAt: null,
  realtimeChannel: null,

  loadSummary: async (shopId: string) => {
    if (!shopId) return;
    set({ status: 'loading', error: null });
    try {
      const summary = await creditService.fetchCreditSummary(shopId);
      const alerts = creditService.computeAlerts(summary);
      set({
        summary,
        alerts,
        status: 'success',
        isOwner: true,
        lastLoadedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      const msg = err.message || '';
      const isForbidden = msg.includes('PERMISSION_DENIED') || msg.includes('Owner');
      set({
        status: 'error',
        error: isForbidden
          ? 'Only the shop owner can view credit and financial records.'
          : msg || 'Failed to load credit summary.',
        isOwner: !isForbidden,
      });
    }
  },

  loadLedger: async (shopId: string, filterType?: string, cursor?: string | null) => {
    if (!shopId) return;
    const currentFilter = filterType !== undefined ? filterType : get().filterType;
    try {
      const entries = await creditService.fetchLedger(shopId, currentFilter, 50, cursor);
      const outstanding = get().summary?.outstanding ?? 0;
      const withBalances = creditService.computeRunningBalances(entries, outstanding);
      set({ ledgerEntries: withBalances });
    } catch (err: any) {
      console.warn('[CreditStore] Failed to load ledger entries:', err);
    }
  },

  setFilterType: (shopId: string, filterType: string) => {
    set({ filterType });
    void get().loadLedger(shopId, filterType);
  },

  computeAlerts: () => {
    const s = get().summary;
    if (s) {
      set({ alerts: creditService.computeAlerts(s) });
    }
  },

  subscribe: (shopId: string) => {
    const existing = get().realtimeChannel;
    if (existing) {
      void supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(`credit_ledger_${shopId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customer_ledger',
          filter: `shop_id=eq.${shopId}`,
        },
        () => {
          void get().loadSummary(shopId);
          void get().loadLedger(shopId);
        },
      )
      .subscribe();

    set({ realtimeChannel: channel });
  },

  unsubscribe: () => {
    const ch = get().realtimeChannel;
    if (ch) {
      void supabase.removeChannel(ch);
      set({ realtimeChannel: null });
    }
  },

  reset: () => {
    get().unsubscribe();
    set({
      summary: null,
      ledgerEntries: [],
      alerts: [],
      filterType: 'all',
      status: 'idle',
      error: null,
      isOwner: true,
      lastLoadedAt: null,
    });
  },
}));
