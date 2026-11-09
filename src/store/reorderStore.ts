import { create } from 'zustand';
import { createAsyncSlice, type AsyncSlice } from '@/store/createAsyncSlice';
import { reorderService } from '@/lib/reorderService';
import { useCartStore } from '@/store/cartStore';
import type {
  ReorderPreviewData,
  ReorderSelection,
} from '@/types/reorder.types';

export interface ReorderState extends AsyncSlice {
  preview: ReorderPreviewData | null;
  selections: Record<
    string,
    {
      variantId: string;
      qty: number;
      skip: boolean;
      replacementVariantId?: string | null;
    }
  >;

  // Actions
  loadPreview: (orderId: string) => Promise<ReorderPreviewData>;
  editQty: (lineId: string, qty: number) => void;
  skipLine: (lineId: string) => void;
  unskipLine: (lineId: string) => void;
  replaceLine: (lineId: string, replacementVariantId: string) => void;
  apply: (orderId: string) => Promise<{ cartId: string; addedCount: number; skippedCount: number }>;
  reset: () => void;
}

export const useReorderStore = create<ReorderState>((set, get) => {
  const asyncSlice = createAsyncSlice(set as never);

  return {
    ...asyncSlice,
    preview: null,
    selections: {},

    loadPreview: async (orderId: string) => {
      set({ status: 'loading', error: null });
      try {
        const preview = await reorderService.getReorderPreview(orderId);
        const initialSelections: Record<
          string,
          {
            variantId: string;
            qty: number;
            skip: boolean;
            replacementVariantId?: string | null;
          }
        > = {};

        preview.lines.forEach((line) => {
          initialSelections[line.lineId] = {
            variantId: line.variantId || '',
            qty: line.adjustedQty,
            skip: !line.isAvailable, // default skip unavailable lines
            replacementVariantId: null,
          };
        });

        set({
          preview,
          selections: initialSelections,
          status: 'success',
          error: null,
        });

        return preview;
      } catch (err: any) {
        set({ status: 'error', error: err });
        throw err;
      }
    },

    editQty: (lineId: string, qty: number) => {
      const current = get().selections[lineId];
      if (!current) return;
      set((state) => ({
        selections: {
          ...state.selections,
          [lineId]: {
            ...current,
            qty: Math.max(1, qty),
          },
        },
      }));
    },

    skipLine: (lineId: string) => {
      const current = get().selections[lineId];
      if (!current) return;
      set((state) => ({
        selections: {
          ...state.selections,
          [lineId]: {
            ...current,
            skip: true,
          },
        },
      }));
    },

    unskipLine: (lineId: string) => {
      const current = get().selections[lineId];
      if (!current) return;
      set((state) => ({
        selections: {
          ...state.selections,
          [lineId]: {
            ...current,
            skip: false,
          },
        },
      }));
    },

    replaceLine: (lineId: string, replacementVariantId: string) => {
      const current = get().selections[lineId];
      if (!current) return;
      set((state) => ({
        selections: {
          ...state.selections,
          [lineId]: {
            ...current,
            variantId: replacementVariantId,
            replacementVariantId,
            skip: false,
          },
        },
      }));
    },

    apply: async (orderId: string) => {
      const { selections } = get();
      const selectionArray: ReorderSelection[] = Object.values(selections).map((s) => ({
        variantId: s.replacementVariantId || s.variantId,
        qty: s.qty,
        skip: s.skip,
      }));

      set({ status: 'loading', error: null });
      try {
        const result = await reorderService.applyReorder(orderId, selectionArray);
        // Refresh cart store with the cart id
        if (result.cartId) {
          await useCartStore.getState().load(result.cartId);
        }
        set({ status: 'success', error: null });
        return result;
      } catch (err: any) {
        set({ status: 'error', error: err });
        throw err;
      }
    },

    reset: () => {
      set({
        preview: null,
        selections: {},
        status: 'idle',
        error: null,
      });
    },
  };
});
