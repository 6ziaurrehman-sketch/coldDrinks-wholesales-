import { create } from 'zustand';
import { createAsyncSlice, type AsyncSlice } from '@/store/createAsyncSlice';
import { orderHistoryService } from '@/lib/orderHistoryService';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { AppError } from '@/lib/errors';
import type {
  OrderHistoryItem,
  OrderHistoryDetail,
  OrderHistoryFilters,
} from '@/types/orderHistory.types';

export interface OrderHistoryState extends AsyncSlice {
  list: OrderHistoryItem[];
  filters: OrderHistoryFilters;
  cursor: string | null;
  hasMore: boolean;
  detailCache: Record<string, OrderHistoryDetail>;
  cachedFirstPage: OrderHistoryItem[];
  isLoadingMore: boolean;

  // Actions
  applyFilters: (partial: Partial<OrderHistoryFilters>) => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  loadDetail: (orderId: string) => Promise<OrderHistoryDetail>;
  reorder: (orderId: string) => Promise<{ addedCount: number; skippedCount: number }>;
  reset: () => void;
}

const DEFAULT_FILTERS: OrderHistoryFilters = {
  dateRange: {
    from: null,
    to: null,
  },
  status: [],
  query: '',
};

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export const useOrderHistoryStore = create<OrderHistoryState>((set, get) => {
  const asyncSlice = createAsyncSlice(set as never);

  return {
    ...asyncSlice,
    list: [],
    filters: { ...DEFAULT_FILTERS },
    cursor: null,
    hasMore: false,
    detailCache: {},
    cachedFirstPage: [],
    isLoadingMore: false,

    applyFilters: async (partial: Partial<OrderHistoryFilters>) => {
      const currentFilters = get().filters;
      const nextFilters: OrderHistoryFilters = {
        ...currentFilters,
        ...partial,
        dateRange: {
          ...currentFilters.dateRange,
          ...(partial.dateRange || {}),
        },
      };

      set({ filters: nextFilters });

      // If query changed, debounce the fetch
      if (partial.query !== undefined && partial.query !== currentFilters.query) {
        if (debounceTimer) clearTimeout(debounceTimer);
        return new Promise<void>((resolve) => {
          debounceTimer = setTimeout(() => {
            void get().refresh().then(resolve);
          }, 350);
        });
      }

      await get().refresh();
    },

    refresh: async () => {
      const activeShopId = useAuthStore.getState().activeShopId;
      if (!activeShopId) {
        set({ list: [], cursor: null, hasMore: false });
        return;
      }

      await asyncSlice.run(async () => {
        const result = await orderHistoryService.listOrders({
          shopId: activeShopId,
          filters: get().filters,
          cursor: null,
          limit: 20,
        });

        set({
          list: result.orders,
          cursor: result.nextCursor,
          hasMore: result.hasMore,
          // Cache first page for offline viewing
          cachedFirstPage: result.orders,
        });
      });
    },

    loadMore: async () => {
      const { hasMore, cursor, isLoadingMore, filters, list } = get();
      if (!hasMore || !cursor || isLoadingMore) return;

      const activeShopId = useAuthStore.getState().activeShopId;
      if (!activeShopId) return;

      set({ isLoadingMore: true });
      try {
        const result = await orderHistoryService.listOrders({
          shopId: activeShopId,
          filters,
          cursor,
          limit: 20,
        });

        set({
          list: [...list, ...result.orders],
          cursor: result.nextCursor,
          hasMore: result.hasMore,
          isLoadingMore: false,
        });
      } catch (err) {
        set({ isLoadingMore: false });
        throw err;
      }
    },

    loadDetail: async (orderId: string) => {
      // Check cache first
      const cached = get().detailCache[orderId];
      if (cached) return cached;

      set({ status: 'loading', error: null });
      try {
        const detail = await orderHistoryService.getOrderDetail(orderId);
        set((state) => ({
          detailCache: {
            ...state.detailCache,
            [orderId]: detail,
          },
          status: 'success',
          error: null,
        }));
        return detail;
      } catch (err) {
        set({ status: 'error', error: err as any });
        throw err;
      }
    },

    /**
     * Reorder action: Loads items from order and adds to active cart.
     * Skips items with deleted variants gracefully.
     */
    reorder: async (orderId: string) => {
      const detail = await get().loadDetail(orderId);
      const activeShopId = useAuthStore.getState().activeShopId;
      if (!activeShopId) {
        throw new AppError({
          code: 'NO_ACTIVE_SHOP',
          message: 'No active shop selected.',
        });
      }

      const cartStore = useCartStore.getState();
      let addedCount = 0;
      let skippedCount = 0;

      for (const item of detail.items) {
        if (item.variantId) {
          try {
            await cartStore.setQty(activeShopId, item.variantId, item.orderedQty);
            addedCount++;
          } catch {
            skippedCount++;
          }
        } else {
          // Deleted or unavailable product
          skippedCount++;
        }
      }

      return { addedCount, skippedCount };
    },

    reset: () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      set({
        list: [],
        filters: { ...DEFAULT_FILTERS },
        cursor: null,
        hasMore: false,
        detailCache: {},
        cachedFirstPage: [],
        isLoadingMore: false,
        status: 'idle',
        error: null,
      });
    },
  };
});
