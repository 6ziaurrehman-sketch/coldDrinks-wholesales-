import { AppError, mapSupabaseError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type {
  CustomerAddress,
  DeliveryZone,
  ServiceableZoneResult,
  ShopDeliveryPreferences,
} from '@/types/database.types';

export interface SaveAddressParams {
  shopId: string;
  addressId?: string | null;
  label: string;
  fullAddress: string;
  lat: number | null;
  lng: number | null;
  area?: string;
  contactName?: string;
  contactPhone?: string;
  instructions?: string;
  isDefault?: boolean;
  expectedUpdatedAt?: string | null;
}

export class AddressService {
  /**
   * Fetch all active customer addresses for the shop
   */
  async fetchAddresses(shopId: string): Promise<CustomerAddress[]> {
    try {
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('shop_id', shopId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Fetch all active delivery zones
   */
  async fetchZones(): Promise<DeliveryZone[]> {
    try {
      const { data, error } = await supabase
        .from('delivery_zones')
        .select('*')
        .eq('active', true)
        .order('fee', { ascending: true });

      if (error) throw error;
      return data ?? [];
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Pre-validate location serviceability before save or at order time
   */
  async checkServiceable(params: {
    lat: number | null;
    lng: number | null;
    area?: string;
    fullAddress?: string;
  }): Promise<ServiceableZoneResult> {
    try {
      const { data, error } = await supabase.rpc('check_address_serviceable', {
        p_lat: params.lat,
        p_lng: params.lng,
        p_city: 'Karachi',
        p_area: params.area ?? null,
        p_full_address: params.fullAddress ?? null,
      });

      if (error) throw error;
      const res = data as {
        serviceable: boolean;
        zone_id: string;
        zone_name: string;
        fee: number;
        min_order_amount: number;
        available_slots: string[];
      };

      return {
        serviceable: res.serviceable,
        zoneId: res.zone_id,
        zoneName: res.zone_name,
        fee: Number(res.fee),
        minOrderAmount: Number(res.min_order_amount),
        availableSlots: res.available_slots || [],
      };
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Save customer address (atomic insert/update with zone resolution & duplicate check)
   */
  async saveAddress(params: SaveAddressParams): Promise<CustomerAddress> {
    try {
      const { data, error } = await supabase.rpc('save_customer_address', {
        p_shop_id: params.shopId,
        p_address_id: params.addressId ?? null,
        p_label: params.label,
        p_full_address: params.fullAddress,
        p_lat: params.lat,
        p_lng: params.lng,
        p_area: params.area ?? null,
        p_contact_name: params.contactName ?? null,
        p_contact_phone: params.contactPhone ?? null,
        p_instructions: params.instructions ?? null,
        p_is_default: params.isDefault ?? false,
        p_expected_updated_at: params.expectedUpdatedAt ?? null,
      });

      if (error) throw error;
      return data as unknown as CustomerAddress;
    } catch (err) {
      throw mapSupabaseError(err, { isWrite: true });
    }
  }

  /**
   * Set address as the single default active address for this shop
   */
  async setDefault(shopId: string, addressId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('set_default_address', {
        p_shop_id: shopId,
        p_address_id: addressId,
      });

      if (error) throw error;
    } catch (err) {
      throw mapSupabaseError(err, { isWrite: true });
    }
  }

  /**
   * Delete address (checks if referenced on active orders; auto-promotes next default)
   */
  async deleteAddress(
    addressId: string,
  ): Promise<{ deletedId: string; newDefaultId: string | null }> {
    try {
      const { data, error } = await supabase.rpc('delete_customer_address', {
        p_address_id: addressId,
      });

      if (error) throw error;
      const res = data as { deleted_id: string; new_default_id: string | null };
      return {
        deletedId: res.deleted_id,
        newDefaultId: res.new_default_id,
      };
    } catch (err) {
      throw mapSupabaseError(err, { isWrite: true });
    }
  }

  /**
   * Fetch shop delivery preferences (preferred period, standing instructions, substitution)
   */
  async fetchShopPreferences(shopId: string): Promise<ShopDeliveryPreferences> {
    try {
      const { data, error } = await supabase
        .from('shops')
        .select('preferred_delivery_period, standing_instructions, substitution_preference')
        .eq('id', shopId)
        .single();

      if (error) throw error;
      if (!data) {
        throw new AppError({
          code: 'NOT_FOUND',
          message: 'Shop preferences not found.',
        });
      }

      return {
        preferredDeliveryPeriod: (data.preferred_delivery_period ?? 'morning') as ShopDeliveryPreferences['preferredDeliveryPeriod'],
        standingInstructions: data.standing_instructions,
        substitutionPreference: (data.substitution_preference ?? 'call_me') as ShopDeliveryPreferences['substitutionPreference'],
      };
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Update shop delivery preferences
   */
  async updateShopPreferences(
    shopId: string,
    preferences: Partial<ShopDeliveryPreferences>,
  ): Promise<ShopDeliveryPreferences> {
    try {
      const { data, error } = await supabase.rpc('update_shop_delivery_preferences', {
        p_shop_id: shopId,
        p_period: preferences.preferredDeliveryPeriod ?? null,
        p_instructions: preferences.standingInstructions ?? null,
        p_substitution: preferences.substitutionPreference ?? null,
      });

      if (error) throw error;
      const res = data as {
        preferred_delivery_period: ShopDeliveryPreferences['preferredDeliveryPeriod'];
        standing_instructions: string | null;
        substitution_preference: ShopDeliveryPreferences['substitutionPreference'];
      };

      return {
        preferredDeliveryPeriod: res.preferred_delivery_period,
        standingInstructions: res.standing_instructions,
        substitutionPreference: res.substitution_preference,
      };
    } catch (err) {
      throw mapSupabaseError(err, { isWrite: true });
    }
  }
}

export const addressService = new AddressService();
