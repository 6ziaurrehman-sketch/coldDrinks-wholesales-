import { create } from 'zustand';
import { createAsyncSlice, type AsyncSlice } from '@/store/createAsyncSlice';
import { HomeFeed } from '@/types/home.types';
import { getHomeFeed } from '@/lib/homeService';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { ExpoSecureStoreAdapter } from '@/lib/supabase';

type HomeState = AsyncSlice & {
  feed: HomeFeed | null;
  lastFetchedAt: number | null;
  loadHome: (background?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
};

const HOME_CACHE_KEY = 'home_feed_cache';

export const useHomeStore = create<HomeState>((set, get) => ({
  ...createAsyncSlice<HomeState>(set, get),
  feed: null,
  lastFetchedAt: null,
  
  loadHome: async (background = false) => {
    const authState = useAuthStore.getState();
    const activeShopId = authState.activeShopId || authState.profile?.active_shop_id || authState.shops[0]?.shopId || 'e32ddd61-5e46-4b6c-ad27-a8936e7f0494';
    if (!activeShopId) return;

    if (!background) {
      try {
        const cached = await ExpoSecureStoreAdapter.getItem(HOME_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          set({ feed: parsed.feed, lastFetchedAt: parsed.timestamp, status: 'success' });
        }
      } catch {
        // Cache miss
      }
    }

    const { isOnline } = useUiStore.getState();
    if (!isOnline && get().feed) return; // Have cache and offline

    await get().run(async () => {
      const feed = await getHomeFeed(activeShopId);
      const timestamp = Date.now();
      set({ feed, lastFetchedAt: timestamp });
      
      try {
        await ExpoSecureStoreAdapter.setItem(HOME_CACHE_KEY, JSON.stringify({ feed, timestamp }));
      } catch {
        // Cache write failed
      }
    });
  },

  refresh: async () => {
    await get().loadHome(false);
  },
  
  reset: () => set({ feed: null, lastFetchedAt: null, status: 'idle', error: null }),
}));
