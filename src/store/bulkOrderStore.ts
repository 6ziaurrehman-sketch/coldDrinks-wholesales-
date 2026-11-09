import { create } from 'zustand';
import { bulkOrderService, type CatalogVariantRef } from '@/lib/bulkOrderService';
import type { BulkParsedLine } from '@/types/advancedModules.types';

interface BulkOrderState {
  rawText: string;
  parsedLines: BulkParsedLine[];
  mergedCount: number;
  status: 'idle' | 'parsing' | 'reviewed';

  // Actions
  setRawText: (text: string) => void;
  parseInput: (catalog: CatalogVariantRef[]) => void;
  updateLineQuantity: (index: number, quantity: number) => void;
  updateLineVariant: (index: number, variant: CatalogVariantRef) => void;
  removeLine: (index: number) => void;
  reset: () => void;
}

export const useBulkOrderStore = create<BulkOrderState>((set, get) => ({
  rawText: '',
  parsedLines: [],
  mergedCount: 0,
  status: 'idle',

  setRawText: (text) => set({ rawText: text }),

  parseInput: (catalog) => {
    const { rawText } = get();
    set({ status: 'parsing' });

    const lines = rawText.split('\n');
    const result = bulkOrderService.parseLines(lines, catalog);

    set({
      parsedLines: result.parsedLines,
      mergedCount: result.mergedDuplicatesCount,
      status: 'reviewed',
    });
  },

  updateLineQuantity: (index, quantity) => {
    const { parsedLines } = get();
    if (index < 0 || index >= parsedLines.length) return;

    const updated = [...parsedLines];
    if (quantity <= 0) {
      updated[index] = { ...updated[index], parsedQty: quantity, status: 'invalid_qty' };
    } else {
      updated[index] = {
        ...updated[index],
        parsedQty: quantity,
        status: updated[index].variantId ? 'ok' : updated[index].status,
      };
    }

    set({ parsedLines: updated });
  },

  updateLineVariant: (index, variant) => {
    const { parsedLines } = get();
    if (index < 0 || index >= parsedLines.length) return;

    const updated = [...parsedLines];
    updated[index] = {
      ...updated[index],
      status: variant.inStock ? 'ok' : 'unavailable',
      variantId: variant.variantId,
      variantName: variant.variantName,
      productName: variant.productName,
      unitPrice: variant.unitPrice,
      packSize: variant.packSize,
      saleUnit: variant.saleUnit,
      candidates: undefined,
    };

    set({ parsedLines: updated });
  },

  removeLine: (index) => {
    const { parsedLines } = get();
    set({ parsedLines: parsedLines.filter((_, i) => i !== index) });
  },

  reset: () => {
    set({
      rawText: '',
      parsedLines: [],
      mergedCount: 0,
      status: 'idle',
    });
  },
}));
