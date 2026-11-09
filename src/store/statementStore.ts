import { create } from 'zustand';
import { statementService } from '@/lib/statementService';
import type {
  StatementMovement,
  StatementPreset,
  StatementSummary,
} from '@/types/statements.types';

interface StatementState {
  preset: StatementPreset;
  customRange: { from: string; to: string } | null;
  summary: StatementSummary | null;
  lines: StatementMovement[];
  filterType: 'all' | 'charge' | 'payment' | 'credit_note';
  status: 'idle' | 'loading' | 'success' | 'error';
  isOwner: boolean;
  exportingProgress: number;
  error: string | null;

  // Actions
  setPreset: (preset: StatementPreset, shopId: string) => void;
  setCustomRange: (range: { from: string; to: string }, shopId: string) => void;
  setFilterType: (filter: 'all' | 'charge' | 'payment' | 'credit_note') => void;
  loadStatement: (shopId: string) => Promise<void>;
  exportPdf: (shopId: string) => Promise<void>;
  reset: () => void;
}

export const useStatementStore = create<StatementState>((set, get) => ({
  preset: 'this_month',
  customRange: null,
  summary: null,
  lines: [],
  filterType: 'all',
  status: 'idle',
  isOwner: true,
  exportingProgress: 0,
  error: null,

  setPreset: (preset: StatementPreset, shopId: string) => {
    set({ preset, customRange: null });
    if (shopId) {
      void get().loadStatement(shopId);
    }
  },

  setCustomRange: (range: { from: string; to: string }, shopId: string) => {
    set({ preset: 'custom', customRange: range });
    if (shopId) {
      void get().loadStatement(shopId);
    }
  },

  setFilterType: (filterType: 'all' | 'charge' | 'payment' | 'credit_note') => {
    set({ filterType });
  },

  loadStatement: async (shopId: string) => {
    if (!shopId) return;
    set({ status: 'loading', error: null });

    try {
      const { preset, customRange } = get();
      const range = preset === 'custom' && customRange
        ? customRange
        : statementService.getPresetRange(preset);

      const res = await statementService.fetchStatement(shopId, range.from, range.to);

      set({
        summary: res.summary,
        lines: res.lines,
        isOwner: true,
        status: 'success',
      });
    } catch (err: any) {
      if (err.message === 'PERMISSION_DENIED') {
        set({
          isOwner: false,
          status: 'error',
          error: 'Only the shop owner is authorized to view account statements.',
        });
      } else {
        set({
          status: 'error',
          error: err.message || 'Failed to load statement.',
        });
      }
    }
  },

  exportPdf: async (shopId: string) => {
    if (!shopId) return;
    const { preset, customRange } = get();
    const range = preset === 'custom' && customRange
      ? customRange
      : statementService.getPresetRange(preset);

    try {
      set({ exportingProgress: 0.1 });
      await statementService.exportAndShareStatement(
        shopId,
        range.from,
        range.to,
        (progress) => set({ exportingProgress: progress }),
      );
      set({ exportingProgress: 0 });
    } catch (err: any) {
      set({ exportingProgress: 0 });
      throw err;
    }
  },

  reset: () => {
    set({
      preset: 'this_month',
      customRange: null,
      summary: null,
      lines: [],
      filterType: 'all',
      status: 'idle',
      isOwner: true,
      exportingProgress: 0,
      error: null,
    });
  },
}));
