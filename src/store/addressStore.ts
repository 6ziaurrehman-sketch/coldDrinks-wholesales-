import { create } from 'zustand';

import { addressService, type SaveAddressParams } from '@/lib/addressService';
import { AppError, ErrorCode, mapSupabaseError } from '@/lib/errors';
import { ExpoSecureStoreAdapter } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { createAsyncSlice, type AsyncSlice } from '@/store/createAsyncSlice';
import type {
  CustomerAddress,
  DeliveryZone,
  ServiceableZoneResult,
  ShopDeliveryPreferences,
} from '@/types/database.types';

const ADDRESS_CACHE_KEY_PREFIX = 'colddrinks.cached_addresses.';

export interface AddressState extends AsyncSlice {
  addresses: CustomerAddress[];
  zones: DeliveryZone[];
  defaultId: string | null;
  selectedAddressId: string | null;
  preferences: ShopDeliveryPreferences | null;
  activeShopId: string | null;

  // Actions
  loadAddresses: (shopId?: string) => Promise<void>;
  addAddress: (payload: Omit<SaveAddressParams, 'shopId'>) => Promise<CustomerAddress>;
  updateAddress: (
    addressId: string,
    expectedUpdatedAt: string,
    payload: Omit<SaveAddressParams, 'shopId' | 'addressId'>,
  ) => Promise<CustomerAddress>;
  removeAddress: (addressId: string) => Promise<void>;
  setDefault: (addressId: string) => Promise<void>;
  selectAddress: (addressId: string) => void;
  checkServiceable: (params: {
    lat: number | null;
    lng: number | null;
    area?: string;
    fullAddress?: string;
  }) => Promise<ServiceableZoneResult>;
  revalidateAddressZone: (
    addressId: string,
  ) => Promise<{ serviceable: boolean; fee: number; minOrderAmount: number }>;
  loadPreferences: (shopId?: string) => Promise<void>;
  updatePreferences: (payload: Partial<ShopDeliveryPreferences>) => Promise<void>;
  reset: () => void;
}

export const useAddressStore = create<AddressState>((set, get) => {
  const asyncSlice = createAsyncSlice(set as never);

  const saveToLocalCache = async (shopId: string, addresses: CustomerAddress[]) => {
    try {
      await ExpoSecureStoreAdapter.setItem(
        `${ADDRESS_CACHE_KEY_PREFIX}${shopId}`,
        JSON.stringify(addresses),
      );
    } catch {
      // Best-effort offline cache write
    }
  };

  const loadFromLocalCache = async (shopId: string): Promise<CustomerAddress[]> => {
    try {
      const raw = await ExpoSecureStoreAdapter.getItem(`${ADDRESS_CACHE_KEY_PREFIX}${shopId}`);
      if (raw) {
        return JSON.parse(raw) as CustomerAddress[];
      }
    } catch {
      // Fallback
    }
    return [];
  };

  return {
    ...asyncSlice,
    addresses: [],
    zones: [],
    defaultId: null,
    selectedAddressId: null,
    preferences: null,
    activeShopId: null,

    loadAddresses: async (explicitShopId?: string) => {
      const targetShopId = explicitShopId ?? useAuthStore.getState().activeShopId;
      if (!targetShopId) {
        set({ status: 'idle', error: null, addresses: [], defaultId: null });
        return;
      }

      set({ activeShopId: targetShopId });

      await asyncSlice.run(async () => {
        try {
          const [addresses, zones] = await Promise.all([
            addressService.fetchAddresses(targetShopId),
            addressService.fetchZones(),
          ]);

          const defaultAddr = addresses.find((a) => a.is_default);
          const currentSelected = get().selectedAddressId;

          set({
            addresses,
            zones,
            defaultId: defaultAddr?.id ?? null,
            selectedAddressId: currentSelected ?? defaultAddr?.id ?? addresses[0]?.id ?? null,
          });

          // Persist for offline viewing
          void saveToLocalCache(targetShopId, addresses);
        } catch (fetchErr) {
          // If network failed, attempt to load cached addresses for offline viewing
          const cached = await loadFromLocalCache(targetShopId);
          if (cached.length > 0) {
            const defaultAddr = cached.find((a) => a.is_default);
            set({
              addresses: cached,
              defaultId: defaultAddr?.id ?? null,
              selectedAddressId: defaultAddr?.id ?? cached[0]?.id ?? null,
              status: 'idle',
              error: null,
            });
            return;
          }
          throw fetchErr;
        }
      });
    },

    addAddress: async (payload: Omit<SaveAddressParams, 'shopId'>) => {
      const { activeShopId } = get();
      if (!activeShopId) {
        throw new AppError({
          code: 'NO_ACTIVE_SHOP',
          message: 'No active shop selected.',
        });
      }

      set({ status: 'loading', error: null });
      try {
        const saved = await addressService.saveAddress({
          ...payload,
          shopId: activeShopId,
        });

        const updatedList = await addressService.fetchAddresses(activeShopId);
        const defaultAddr = updatedList.find((a) => a.is_default);

        set({
          addresses: updatedList,
          defaultId: defaultAddr?.id ?? null,
          selectedAddressId: saved.id,
          status: 'success',
          error: null,
        });

        void saveToLocalCache(activeShopId, updatedList);
        return saved;
      } catch (err) {
        const appErr = mapSupabaseError(err, { isWrite: true });
        set({ status: 'error', error: appErr });
        throw appErr;
      }
    },

    updateAddress: async (
      addressId: string,
      expectedUpdatedAt: string,
      payload: Omit<SaveAddressParams, 'shopId' | 'addressId'>,
    ) => {
      const { activeShopId } = get();
      if (!activeShopId) {
        throw new AppError({
          code: 'NO_ACTIVE_SHOP',
          message: 'No active shop selected.',
        });
      }

      set({ status: 'loading', error: null });
      try {
        const saved = await addressService.saveAddress({
          ...payload,
          shopId: activeShopId,
          addressId,
          expectedUpdatedAt,
        });

        const updatedList = await addressService.fetchAddresses(activeShopId);
        const defaultAddr = updatedList.find((a) => a.is_default);

        set({
          addresses: updatedList,
          defaultId: defaultAddr?.id ?? null,
          status: 'success',
          error: null,
        });

        void saveToLocalCache(activeShopId, updatedList);
        return saved;
      } catch (err) {
        const appErr = mapSupabaseError(err, { isWrite: true });
        set({ status: 'error', error: appErr });
        throw appErr;
      }
    },

    removeAddress: async (addressId: string) => {
      const { activeShopId, addresses } = get();
      if (!activeShopId) {
        throw new AppError({
          code: 'NO_ACTIVE_SHOP',
          message: 'No active shop selected.',
        });
      }

      set({ status: 'loading', error: null });
      try {
        const res = await addressService.deleteAddress(addressId);
        const remaining = addresses.filter((a) => a.id !== addressId);
        const updatedAddresses = remaining.map((a) =>
          a.id === res.newDefaultId ? { ...a, is_default: true } : a,
        );

        set({
          addresses: updatedAddresses,
          defaultId: res.newDefaultId,
          selectedAddressId:
            get().selectedAddressId === addressId ? res.newDefaultId : get().selectedAddressId,
          status: 'success',
          error: null,
        });

        void saveToLocalCache(activeShopId, updatedAddresses);
      } catch (err) {
        const appErr = mapSupabaseError(err, { isWrite: true });
        set({ status: 'error', error: appErr });
        throw appErr;
      }
    },

    setDefault: async (addressId: string) => {
      const { activeShopId, addresses } = get();
      if (!activeShopId) {
        throw new AppError({
          code: 'NO_ACTIVE_SHOP',
          message: 'No active shop selected.',
        });
      }

      set({ status: 'loading', error: null });
      try {
        await addressService.setDefault(activeShopId, addressId);
        const updatedList = addresses.map((a) => ({
          ...a,
          is_default: a.id === addressId,
        }));

        set({
          addresses: updatedList,
          defaultId: addressId,
          status: 'success',
          error: null,
        });

        void saveToLocalCache(activeShopId, updatedList);
      } catch (err) {
        const appErr = mapSupabaseError(err, { isWrite: true });
        set({ status: 'error', error: appErr });
        throw appErr;
      }
    },

    selectAddress: (addressId: string) => {
      set({ selectedAddressId: addressId });
    },

    checkServiceable: async (params) => {
      return await addressService.checkServiceable(params);
    },

    revalidateAddressZone: async (addressId: string) => {
      const { addresses, zones } = get();
      const addr = addresses.find((a) => a.id === addressId);
      if (!addr) {
        throw new AppError({
          code: 'NOT_FOUND',
          message: 'Selected address not found.',
        });
      }

      // Check current zone from server
      const check = await addressService.checkServiceable({
        lat: addr.lat,
        lng: addr.lng,
        fullAddress: addr.full_address,
      });

      // Confirm that the zone is still active
      const zone = zones.find((z) => z.id === check.zoneId);
      if (zone && !zone.active) {
        throw new AppError({
          code: ErrorCode.CUSTOM_RPC_ERROR,
          message: 'The delivery zone for this address has been temporarily deactivated.',
        });
      }

      return {
        serviceable: check.serviceable,
        fee: check.fee,
        minOrderAmount: check.minOrderAmount,
      };
    },

    loadPreferences: async (explicitShopId?: string) => {
      const targetShopId = explicitShopId ?? useAuthStore.getState().activeShopId;
      if (!targetShopId) return;

      try {
        const preferences = await addressService.fetchShopPreferences(targetShopId);
        set({ preferences });
      } catch {
        // Silently preserve existing
      }
    },

    updatePreferences: async (payload: Partial<ShopDeliveryPreferences>) => {
      const { activeShopId } = get();
      if (!activeShopId) {
        throw new AppError({
          code: 'NO_ACTIVE_SHOP',
          message: 'No active shop selected.',
        });
      }

      set({ status: 'loading', error: null });
      try {
        const updated = await addressService.updateShopPreferences(activeShopId, payload);
        set({ preferences: updated, status: 'success', error: null });
      } catch (err) {
        const appErr = mapSupabaseError(err, { isWrite: true });
        set({ status: 'error', error: appErr });
        throw appErr;
      }
    },

    reset: () => {
      set({
        addresses: [],
        zones: [],
        defaultId: null,
        selectedAddressId: null,
        preferences: null,
        activeShopId: null,
        status: 'idle',
        error: null,
      });
    },
  };
});
