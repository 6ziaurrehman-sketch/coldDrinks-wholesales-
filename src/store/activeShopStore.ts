import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { appStorage } from '@/lib/storage';
import { resetAllStores } from '@/store/resetAllStores';
import type { ShopRole } from '@/types/database.types';

const LAST_USED_SHOP_KEY = '@cold_drinks_last_active_shop_id';

export interface ShopSummaryItem {
  id: string;
  name: string;
  city: string;
  area?: string;
  role: ShopRole;
  groupId?: string | null;
  status: string;
}

interface ActiveShopState {
  activeShopId: string | null;
  activeShop: ShopSummaryItem | null;
  availableShops: ShopSummaryItem[];
  myRole: ShopRole | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  isSwitching: boolean;
  abortController: AbortController | null;

  // Actions
  loadUserShops: () => Promise<void>;
  switchShop: (newShopId: string) => Promise<boolean>;
  checkGroupCreditLimit: (amount: number) => Promise<{ allowed: boolean; message?: string }>;
  reset: () => void;
}

export const useActiveShopStore = create<ActiveShopState>((set, get) => ({
  activeShopId: null,
  activeShop: null,
  availableShops: [],
  myRole: null,
  status: 'idle',
  isSwitching: false,
  abortController: null,

  loadUserShops: async () => {
    set({ status: 'loading' });
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) {
        set({ status: 'idle', availableShops: [], activeShopId: null, activeShop: null });
        return;
      }

      // Query shops the user belongs to
      const { data, error } = await supabase
        .from('shop_users')
        .select(`
          role,
          status,
          shop_id,
          shops (
            id,
            name,
            city,
            area,
            group_id,
            status
          )
        `)
        .eq('user_id', user.user.id)
        .eq('status', 'active');

      if (error) throw error;

      const shops: ShopSummaryItem[] = (data || [])
        .filter((row: any) => row.shops)
        .map((row: any) => ({
          id: row.shops.id,
          name: row.shops.name,
          city: row.shops.city,
          area: row.shops.area,
          role: row.role as ShopRole,
          groupId: row.shops.group_id,
          status: row.shops.status,
        }));

      // Determine active shop
      const savedShopId = await appStorage.getItem(LAST_USED_SHOP_KEY);
      let targetShop = shops.find((s) => s.id === savedShopId) || shops[0] || null;

      set({
        availableShops: shops,
        activeShopId: targetShop?.id || null,
        activeShop: targetShop,
        myRole: targetShop?.role || null,
        status: 'success',
      });

      if (targetShop) {
        await appStorage.setItem(LAST_USED_SHOP_KEY, targetShop.id);
      }
    } catch (err: any) {
      console.warn('[ActiveShopStore] loadUserShops failed:', err);
      set({ status: 'error' });
    }
  },

  switchShop: async (newShopId: string): Promise<boolean> => {
    const { activeShopId, availableShops, abortController } = get();
    if (activeShopId === newShopId) return true;

    const targetShop = availableShops.find((s) => s.id === newShopId);
    if (!targetShop) return false;

    // 1. Abort in-flight network requests
    if (abortController) {
      abortController.abort();
    }
    const newAbortController = new AbortController();

    set({ isSwitching: true, abortController: newAbortController });

    try {
      // 2. Reset ALL feature stores & realtime channels to avoid state leakage
      await resetAllStores();

      // 3. Persist new shop selection
      await appStorage.setItem(LAST_USED_SHOP_KEY, newShopId);

      // 4. Update store state
      set({
        activeShopId: targetShop.id,
        activeShop: targetShop,
        myRole: targetShop.role,
        isSwitching: false,
      });

      return true;
    } catch (err) {
      console.error('[ActiveShopStore] switchShop error:', err);
      set({ isSwitching: false });
      return false;
    }
  },

  checkGroupCreditLimit: async (amount: number): Promise<{ allowed: boolean; message?: string }> => {
    const { activeShopId } = get();
    if (!activeShopId) return { allowed: true };

    try {
      const { data, error } = await (supabase as any).rpc('check_group_credit_limit', {
        p_shop_id: activeShopId,
        p_amount: amount,
      });

      if (error) {
        console.warn('[ActiveShopStore] checkGroupCreditLimit RPC error:', error);
        return { allowed: true };
      }

      if (data?.has_group_limit && !data.allowed) {
        return {
          allowed: false,
          message: `Branch group credit limit exceeded. Available branch credit: Rs. ${data.group_available}`,
        };
      }

      return { allowed: true };
    } catch {
      return { allowed: true };
    }
  },

  reset: () => {
    const { abortController } = get();
    if (abortController) abortController.abort();
    set({
      activeShopId: null,
      activeShop: null,
      availableShops: [],
      myRole: null,
      status: 'idle',
      isSwitching: false,
      abortController: null,
    });
  },
}));
