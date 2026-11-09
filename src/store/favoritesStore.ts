import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createAsyncSlice, type AsyncSlice } from '@/store/createAsyncSlice';
import { reorderService } from '@/lib/reorderService';
import { supabase } from '@/lib/supabase';

export interface FavoritesState extends AsyncSlice {
  ids: Set<string>;
  activeShopId: string | null;
  channel: RealtimeChannel | null;
  hasLoaded: boolean;

  // Actions
  load: (shopId: string) => Promise<void>;
  toggle: (shopId: string, variantId: string) => Promise<boolean>;
  isFavorite: (variantId: string) => boolean;
  subscribe: (shopId: string) => void;
  unsubscribe: () => void;
  reset: () => void;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => {
  const asyncSlice = createAsyncSlice(set as never);

  return {
    ...asyncSlice,
    ids: new Set<string>(),
    activeShopId: null,
    channel: null,
    hasLoaded: false,

    load: async (shopId: string) => {
      if (get().hasLoaded && get().activeShopId === shopId) return;

      set({ activeShopId: shopId });
      await asyncSlice.run(async () => {
        const variantIds = await reorderService.fetchFavorites(shopId);
        set({
          ids: new Set(variantIds),
          hasLoaded: true,
        });
      });

      get().subscribe(shopId);
    },

    toggle: async (shopId: string, variantId: string) => {
      const currentIds = new Set(get().ids);
      const wasFavorite = currentIds.has(variantId);

      // Optimistic update
      if (wasFavorite) {
        currentIds.delete(variantId);
      } else {
        currentIds.add(variantId);
      }
      set({ ids: currentIds });

      try {
        const isFav = await reorderService.toggleFavorite(shopId, variantId);
        // Ensure server state matches
        const verifiedIds = new Set(get().ids);
        if (isFav) verifiedIds.add(variantId);
        else verifiedIds.delete(variantId);
        set({ ids: verifiedIds });
        return isFav;
      } catch (err) {
        // Rollback on error
        const rollbackIds = new Set(get().ids);
        if (wasFavorite) rollbackIds.add(variantId);
        else rollbackIds.delete(variantId);
        set({ ids: rollbackIds });
        throw err;
      }
    },

    isFavorite: (variantId: string) => {
      return get().ids.has(variantId);
    },

    subscribe: (shopId: string) => {
      get().unsubscribe();

      const channel = supabase
        .channel(`shop_favorites_${shopId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'favorites',
            filter: `shop_id=eq.${shopId}`,
          },
          (payload) => {
            const variantId = (payload.new as any)?.variant_id || (payload.old as any)?.variant_id;
            if (!variantId) return;

            const next = new Set(get().ids);
            if (payload.eventType === 'DELETE') {
              next.delete(variantId);
            } else if (payload.eventType === 'INSERT') {
              next.add(variantId);
            }
            set({ ids: next });
          },
        )
        .subscribe();

      set({ channel });
    },

    unsubscribe: () => {
      const ch = get().channel;
      if (ch) {
        void supabase.removeChannel(ch);
        set({ channel: null });
      }
    },

    reset: () => {
      get().unsubscribe();
      set({
        ids: new Set<string>(),
        activeShopId: null,
        channel: null,
        hasLoaded: false,
        status: 'idle',
        error: null,
      });
    },
  };
});
