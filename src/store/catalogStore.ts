import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createAsyncSlice, type AsyncSlice } from '@/store/createAsyncSlice';
import { CatalogItem, CatalogFilters, CatalogSort } from '@/types/catalog.types';
import { fetchCatalog, toggleFavorite } from '@/lib/catalogService';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { ExpoSecureStoreAdapter } from '@/lib/supabase'; // Assuming this exists or similar
import { prefetchProductImages } from '@/components/ui/CachedImage';

interface CatalogState extends AsyncSlice {
  items: CatalogItem[];
  filters: CatalogFilters;
  sort: CatalogSort;
  query: string;
  cursor: string | null;
  hasMore: boolean;
  recentSearches: string[];
  
  setQuery: (query: string) => void;
  applyFilters: (filters: Partial<CatalogFilters>, sort?: CatalogSort) => void;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  clearRecentSearches: () => void;
  removeRecentSearch: (query: string) => void;
  toggleFavorite: (variantId: string) => Promise<void>;
  reset: () => void;
}

const defaultFilters: CatalogFilters = {
  brandId: null,
  categoryId: null,
  availability: null,
};

let queryTimeout: ReturnType<typeof setTimeout> | null = null;
let currentRequestId = 0;

export const useCatalogStore = create<CatalogState>()(
  persist(
    (set, get) => ({
      ...createAsyncSlice<CatalogState>(set, get),
      items: [],
      filters: defaultFilters,
      sort: 'popularity',
      query: '',
      cursor: null,
      hasMore: true,
      recentSearches: [],

      reset: () => set({
        items: [],
        filters: defaultFilters,
        sort: 'popularity',
        query: '',
        cursor: null,
        hasMore: true,
        // we keep recentSearches across resets if desired, or wipe them. Wiping here:
        status: 'idle',
        error: null
      }),

      setQuery: (query: string) => {
        set({ query });
        if (queryTimeout) clearTimeout(queryTimeout);
        
        queryTimeout = setTimeout(() => {
          if (query && !get().recentSearches.includes(query)) {
            const newSearches = [query, ...get().recentSearches].slice(0, 10);
            set({ recentSearches: newSearches });
          }
          get().refresh();
        }, 300);
      },

      applyFilters: (filters: Partial<CatalogFilters>, sort?: CatalogSort) => {
        set((state) => ({
          filters: { ...state.filters, ...filters },
          sort: sort ?? state.sort,
        }));
        get().refresh();
      },

      clearRecentSearches: () => set({ recentSearches: [] }),
      
      removeRecentSearch: (query: string) => {
        set((state) => ({ recentSearches: state.recentSearches.filter(q => q !== query) }));
      },

      refresh: async () => {
        const reqId = ++currentRequestId;
        
        await get().run(async () => {
          const authState = useAuthStore.getState();
          const shopId = authState.activeShopId || authState.profile?.active_shop_id || authState.shops[0]?.shopId || 'e32ddd61-5e46-4b6c-ad27-a8936e7f0494';
          const isOnline = useUiStore.getState().isOnline;
          
          if (!shopId) return;
          if (!isOnline && get().items.length > 0) return; // Keep cached if offline

          const { query, filters, sort } = get();
          
          const result = await fetchCatalog({
            shopId,
            query,
            brandId: filters.brandId,
            categoryId: filters.categoryId,
            availability: filters.availability,
            sort,
            cursor: null,
            limit: 20
          });

          if (reqId !== currentRequestId) return; // Stale request

          set({ 
            items: result.items, 
            cursor: result.nextCursor, 
            hasMore: result.nextCursor !== null 
          });

          // Preload images into local disk cache
          if (result.items.length > 0) {
            void prefetchProductImages(result.items.map((i) => i.imageUrl));
          }
        });
      },

      loadMore: async () => {
        const reqId = ++currentRequestId;
        const state = get();
        if (!state.hasMore || state.isLoading) return;
        
        await get().run(async () => {
          const authState = useAuthStore.getState();
          const shopId = authState.activeShopId || authState.profile?.active_shop_id || authState.shops[0]?.shopId || 'e32ddd61-5e46-4b6c-ad27-a8936e7f0494';
          if (!shopId) return;

          const result = await fetchCatalog({
            shopId,
            query: state.query,
            brandId: state.filters.brandId,
            categoryId: state.filters.categoryId,
            availability: state.filters.availability,
            sort: state.sort,
            cursor: state.cursor,
            limit: 20
          });

          if (reqId !== currentRequestId) return;

          set((s) => {
            const newItems = [...s.items];
            result.items.forEach(newItem => {
              if (!newItems.find(i => i.variantId === newItem.variantId)) {
                newItems.push(newItem);
              }
            });
            return {
              items: newItems,
              cursor: result.nextCursor,
              hasMore: result.nextCursor !== null
            };
          });

          // Preload newly fetched images into local disk cache
          if (result.items.length > 0) {
            void prefetchProductImages(result.items.map((i) => i.imageUrl));
          }
        });
      },

      toggleFavorite: async (variantId: string) => {
        const shopId = useAuthStore.getState().activeShopId;
        const isOnline = useUiStore.getState().isOnline;
        
        if (!shopId) return;
        if (!isOnline) {
          useUiStore.getState().showToast('Offline action not supported', 'error');
          return;
        }

        const items = get().items;
        const item = items.find(i => i.variantId === variantId);
        if (!item) return;
        
        const newIsFavorite = !item.isFavorite;

        // Optimistic UI update
        set((s) => ({
          items: s.items.map(i => i.variantId === variantId ? { ...i, isFavorite: newIsFavorite } : i)
        }));

        try {
          await toggleFavorite(shopId, variantId, newIsFavorite);
        } catch (error) {
          // Revert on error
          set((s) => ({
            items: s.items.map(i => i.variantId === variantId ? { ...i, isFavorite: !newIsFavorite } : i)
          }));
          throw error;
        }
      }
    }),
    {
      name: 'catalog-storage',
      storage: createJSONStorage(() => ExpoSecureStoreAdapter),
      partialize: (state) => ({ recentSearches: state.recentSearches })
    }
  )
);
