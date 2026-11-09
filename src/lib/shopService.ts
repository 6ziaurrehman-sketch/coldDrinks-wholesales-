import { AppError, mapSupabaseError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type {
  Shop,
  ShopContact,
  ShopContactInsert,
  ShopContactUpdate,
  ShopMember,
  ShopRole,
} from '@/types/database.types';

export interface UpdateShopPayload {
  name?: string;
  ownerName?: string;
  phone?: string;
  altPhone?: string;
  email?: string;
  businessType?: string;
  city?: string;
  area?: string;
  lat?: number | null;
  lng?: number | null;
  ntn?: string;
  strn?: string;
  taxRegistered?: boolean;
  defaultDeliveryInstructions?: string;
  approvalThreshold?: number | null;
}

export class ShopService {
  /**
   * Fetch full shop record
   */
  async fetchShop(shopId: string): Promise<Shop> {
    try {
      const { data, error } = await supabase
        .from('shops')
        .select('*')
        .eq('id', shopId)
        .single();

      if (error) throw error;
      if (!data) {
        throw new AppError({
          code: 'NOT_FOUND',
          message: 'Shop not found.',
          status: 404,
        });
      }
      return data;
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Fetch all active & invited members of the shop
   */
  async fetchMembers(shopId: string): Promise<ShopMember[]> {
    try {
      const { data, error } = await supabase.rpc('get_shop_members', {
        p_shop_id: shopId,
      });

      if (error) throw error;

      return (data ?? []).map((row) => ({
        userId: row.user_id,
        role: row.role as ShopRole,
        status: row.status,
        fullName: row.full_name,
        email: row.email,
        phone: row.phone,
        joinedAt: row.joined_at,
      }));
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Fetch all shop contacts
   */
  async fetchContacts(shopId: string): Promise<ShopContact[]> {
    try {
      const { data, error } = await supabase
        .from('shop_contacts')
        .select('*')
        .eq('shop_id', shopId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data ?? [];
    } catch (err) {
      throw mapSupabaseError(err);
    }
  }

  /**
   * Update shop profile with optimistic concurrency check
   */
  async updateShopProfile(
    shopId: string,
    expectedUpdatedAt: string | null,
    payload: UpdateShopPayload,
  ): Promise<Shop> {
    try {
      const { data, error } = await supabase.rpc('update_shop_profile', {
        p_shop_id: shopId,
        p_expected_updated_at: expectedUpdatedAt,
        p_name: payload.name ?? null,
        p_owner_name: payload.ownerName ?? null,
        p_phone: payload.phone ?? null,
        p_alt_phone: payload.altPhone ?? null,
        p_email: payload.email ?? null,
        p_business_type: payload.businessType ?? null,
        p_city: payload.city ?? null,
        p_area: payload.area ?? null,
        p_lat: payload.lat ?? null,
        p_lng: payload.lng ?? null,
        p_ntn: payload.ntn ?? null,
        p_strn: payload.strn ?? null,
        p_tax_registered: payload.taxRegistered ?? false,
        p_default_delivery_instructions: payload.defaultDeliveryInstructions ?? null,
        p_approval_threshold: payload.approvalThreshold ?? null,
      });

      if (error) throw error;
      return data as unknown as Shop;
    } catch (err) {
      throw mapSupabaseError(err, { isWrite: true });
    }
  }

  /**
   * Invite new staff member by mobile phone
   */
  async inviteStaff(
    shopId: string,
    phone: string,
    role: ShopRole,
  ): Promise<{ inviteCode: string; phone: string; role: ShopRole }> {
    try {
      const { data, error } = await supabase.rpc('invite_staff', {
        p_shop_id: shopId,
        p_phone: phone,
        p_role: role,
      });

      if (error) throw error;
      const res = data as { invite_code: string; phone: string; role: ShopRole };
      return {
        inviteCode: res.invite_code,
        phone: res.phone,
        role: res.role,
      };
    } catch (err) {
      throw mapSupabaseError(err, { isWrite: true });
    }
  }

  /**
   * Change a staff member's role (owner only; cannot change self, cannot demote last owner)
   */
  async changeRole(shopId: string, targetUserId: string, newRole: ShopRole): Promise<void> {
    try {
      const { error } = await supabase.rpc('change_role', {
        p_shop_id: shopId,
        p_target_user_id: targetUserId,
        p_new_role: newRole,
      });

      if (error) throw error;
    } catch (err) {
      throw mapSupabaseError(err, { isWrite: true });
    }
  }

  /**
   * Remove a staff member from the shop (owner only; cannot remove self, cannot remove last owner)
   */
  async removeStaff(shopId: string, targetUserId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('remove_staff', {
        p_shop_id: shopId,
        p_target_user_id: targetUserId,
      });

      if (error) throw error;
    } catch (err) {
      throw mapSupabaseError(err, { isWrite: true });
    }
  }

  /**
   * Add a contact person for the shop
   */
  async addContact(
    shopId: string,
    contact: Omit<ShopContactInsert, 'shop_id'>,
  ): Promise<ShopContact> {
    try {
      const { data, error } = await supabase
        .from('shop_contacts')
        .insert({
          ...contact,
          shop_id: shopId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      throw mapSupabaseError(err, { isWrite: true });
    }
  }

  /**
   * Update a contact person
   */
  async updateContact(contactId: string, updates: ShopContactUpdate): Promise<ShopContact> {
    try {
      const { data, error } = await supabase
        .from('shop_contacts')
        .update(updates)
        .eq('id', contactId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      throw mapSupabaseError(err, { isWrite: true });
    }
  }

  /**
   * Delete a contact person
   */
  async removeContact(contactId: string): Promise<void> {
    try {
      const { error } = await supabase.from('shop_contacts').delete().eq('id', contactId);
      if (error) throw error;
    } catch (err) {
      throw mapSupabaseError(err, { isWrite: true });
    }
  }
}

export const shopService = new ShopService();
