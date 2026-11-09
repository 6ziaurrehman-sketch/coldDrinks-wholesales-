import type { RealtimeChannel } from '@supabase/supabase-js';
import { create } from 'zustand';

import { AppError, mapSupabaseError } from '@/lib/errors';
import { can, type AppPermission } from '@/lib/permissions';
import { shopService, type UpdateShopPayload } from '@/lib/shopService';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { createAsyncSlice, type AsyncSlice } from '@/store/createAsyncSlice';
import type {
  Shop,
  ShopContact,
  ShopContactInsert,
  ShopContactUpdate,
  ShopMember,
  ShopRole,
} from '@/types/database.types';

export interface ShopState extends AsyncSlice {
  shop: Shop | null;
  members: ShopMember[];
  contacts: ShopContact[];
  myRole: ShopRole | null;
  activeShopId: string | null;
  realtimeChannel: RealtimeChannel | null;

  // Actions
  loadShop: (shopId?: string) => Promise<void>;
  updateShop: (payload: UpdateShopPayload) => Promise<Shop>;
  inviteStaff: (phone: string, role: ShopRole) => Promise<{ inviteCode: string }>;
  changeRole: (targetUserId: string, newRole: ShopRole) => Promise<void>;
  removeStaff: (targetUserId: string) => Promise<void>;
  loadContacts: () => Promise<void>;
  addContact: (contact: Omit<ShopContactInsert, 'shop_id'>) => Promise<ShopContact>;
  updateContact: (contactId: string, updates: ShopContactUpdate) => Promise<ShopContact>;
  removeContact: (contactId: string) => Promise<void>;
  setApprovalThreshold: (threshold: number | null) => Promise<void>;
  reset: () => void;
}

export const useShopStore = create<ShopState>((set, get) => {
  const asyncSlice = createAsyncSlice(set as never);

  const cleanupRealtime = () => {
    const channel = get().realtimeChannel;
    if (channel) {
      void supabase.removeChannel(channel);
      set({ realtimeChannel: null });
    }
  };

  const subscribeToShopUsers = (shopId: string, currentUserId: string | null) => {
    cleanupRealtime();

    const channel = supabase
      .channel(`shop_users_${shopId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shop_users',
          filter: `shop_id=eq.${shopId}`,
        },
        async (payload) => {
          // Check if current user's role or membership was modified
          const newRecord = payload.new as { user_id?: string; role?: ShopRole; status?: string } | null;
          if (newRecord && currentUserId && newRecord.user_id === currentUserId) {
            const updatedRole = newRecord.role ?? null;
            set({ myRole: updatedRole });
            // Sync with auth store shops list if needed
            void useAuthStore.getState().refreshProfile();
          }

          // Refresh members list on any change
          try {
            const members = await shopService.fetchMembers(shopId);
            set({ members });
          } catch {
            // Silently ignore background realtime refresh failures
          }
        },
      )
      .subscribe();

    set({ realtimeChannel: channel });
  };

  return {
    ...asyncSlice,
    shop: null,
    members: [],
    contacts: [],
    myRole: null,
    activeShopId: null,
    realtimeChannel: null,

    loadShop: async (explicitShopId?: string) => {
      const targetShopId = explicitShopId ?? useAuthStore.getState().activeShopId;
      if (!targetShopId) {
        set({ status: 'idle', error: null, shop: null, members: [], contacts: [] });
        return;
      }

      await asyncSlice.run(async () => {
        set({ activeShopId: targetShopId });

        const [shop, members, contacts] = await Promise.all([
          shopService.fetchShop(targetShopId),
          shopService.fetchMembers(targetShopId),
          shopService.fetchContacts(targetShopId),
        ]);

        const currentUserId = useAuthStore.getState().session?.user?.id ?? null;
        const myMembership = members.find((m) => m.userId === currentUserId);
        const resolvedRole = myMembership?.role ?? null;

        set({
          shop,
          members,
          contacts,
          myRole: resolvedRole,
        });

        subscribeToShopUsers(targetShopId, currentUserId);
      });
    },

    updateShop: async (payload: UpdateShopPayload) => {
      const { shop, activeShopId } = get();
      if (!activeShopId || !shop) {
        throw new AppError({
          code: 'NO_ACTIVE_SHOP',
          message: 'No active shop selected.',
        });
      }

      // Explicitly NOT optimistic: wait for database RPC with updated_at concurrency check
      set({ status: 'loading', error: null });
      try {
        const updated = await shopService.updateShopProfile(
          activeShopId,
          shop.updated_at,
          payload,
        );
        set({ shop: updated, status: 'success', error: null });
        return updated;
      } catch (err) {
        const appErr = mapSupabaseError(err, { isWrite: true });
        set({ status: 'error', error: appErr });
        throw appErr;
      }
    },

    inviteStaff: async (phone: string, role: ShopRole) => {
      const { activeShopId } = get();
      if (!activeShopId) {
        throw new AppError({
          code: 'NO_ACTIVE_SHOP',
          message: 'No active shop selected.',
        });
      }

      set({ status: 'loading', error: null });
      try {
        const res = await shopService.inviteStaff(activeShopId, phone, role);
        const updatedMembers = await shopService.fetchMembers(activeShopId);
        set({ members: updatedMembers, status: 'success', error: null });
        return { inviteCode: res.inviteCode };
      } catch (err) {
        const appErr = mapSupabaseError(err, { isWrite: true });
        set({ status: 'error', error: appErr });
        throw appErr;
      }
    },

    changeRole: async (targetUserId: string, newRole: ShopRole) => {
      const { activeShopId } = get();
      if (!activeShopId) {
        throw new AppError({
          code: 'NO_ACTIVE_SHOP',
          message: 'No active shop selected.',
        });
      }

      set({ status: 'loading', error: null });
      try {
        await shopService.changeRole(activeShopId, targetUserId, newRole);
        const updatedMembers = await shopService.fetchMembers(activeShopId);
        set({ members: updatedMembers, status: 'success', error: null });
      } catch (err) {
        const appErr = mapSupabaseError(err, { isWrite: true });
        set({ status: 'error', error: appErr });
        throw appErr;
      }
    },

    removeStaff: async (targetUserId: string) => {
      const { activeShopId } = get();
      if (!activeShopId) {
        throw new AppError({
          code: 'NO_ACTIVE_SHOP',
          message: 'No active shop selected.',
        });
      }

      set({ status: 'loading', error: null });
      try {
        await shopService.removeStaff(activeShopId, targetUserId);
        const updatedMembers = await shopService.fetchMembers(activeShopId);
        set({ members: updatedMembers, status: 'success', error: null });
      } catch (err) {
        const appErr = mapSupabaseError(err, { isWrite: true });
        set({ status: 'error', error: appErr });
        throw appErr;
      }
    },

    loadContacts: async () => {
      const { activeShopId } = get();
      if (!activeShopId) return;
      try {
        const contacts = await shopService.fetchContacts(activeShopId);
        set({ contacts });
      } catch (err) {
        set({ error: mapSupabaseError(err) });
      }
    },

    addContact: async (contact: Omit<ShopContactInsert, 'shop_id'>) => {
      const { activeShopId } = get();
      if (!activeShopId) {
        throw new AppError({
          code: 'NO_ACTIVE_SHOP',
          message: 'No active shop selected.',
        });
      }

      const newContact = await shopService.addContact(activeShopId, contact);
      const contacts = await shopService.fetchContacts(activeShopId);
      set({ contacts });
      return newContact;
    },

    updateContact: async (contactId: string, updates: ShopContactUpdate) => {
      const { activeShopId } = get();
      const updated = await shopService.updateContact(contactId, updates);
      if (activeShopId) {
        const contacts = await shopService.fetchContacts(activeShopId);
        set({ contacts });
      }
      return updated;
    },

    removeContact: async (contactId: string) => {
      const { activeShopId } = get();
      await shopService.removeContact(contactId);
      if (activeShopId) {
        const contacts = await shopService.fetchContacts(activeShopId);
        set({ contacts });
      }
    },

    setApprovalThreshold: async (threshold: number | null) => {
      const { updateShop } = get();
      await updateShop({ approvalThreshold: threshold });
    },

    reset: () => {
      cleanupRealtime();
      set({
        shop: null,
        members: [],
        contacts: [],
        myRole: null,
        activeShopId: null,
        realtimeChannel: null,
        status: 'idle',
        error: null,
      });
    },
  };
});

/**
 * Unified permission selector creator
 * Usage: const canPlace = useShopStore(selectCan('place_order'));
 */
export const selectCan = (permission: AppPermission) => (state: ShopState): boolean =>
  can(state.myRole, permission);

export const selectShop = (state: ShopState): Shop | null => state.shop;
export const selectMembers = (state: ShopState): ShopMember[] => state.members;
export const selectContacts = (state: ShopState): ShopContact[] => state.contacts;
export const selectMyRole = (state: ShopState): ShopRole | null => state.myRole;
export const selectIsOwner = (state: ShopState): boolean => state.myRole === 'owner';
