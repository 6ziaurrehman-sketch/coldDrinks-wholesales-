import { supabase } from '@/lib/supabase';
import type {
  CreateDiscountRequestInput,
  CreateDiscountRequestResult,
  DiscountRequestRecord,
} from '@/types/discounts.types';

export const discountService = {
  /**
   * Submit discount request with sane caps validation
   */
  async createDiscountRequest(
    input: CreateDiscountRequestInput,
  ): Promise<CreateDiscountRequestResult> {
    const { data, error } = await (supabase as any).rpc('create_discount_request', {
      p_order_id: input.orderId,
      p_requested_type: input.requestedType,
      p_requested_value: input.requestedValue,
      p_message: input.message || null,
      p_expires_in_hours: input.expiresInHours || 4,
    });

    if (error) {
      throw new Error(error.message || 'Failed to submit discount request.');
    }

    return {
      success: true,
      requestId: data?.request_id,
      discountAmount: Number(data?.discount_amount || 0),
      expiresAt: data?.expires_at,
    };
  },

  /**
   * Withdraw active discount request
   */
  async withdrawDiscountRequest(requestId: string): Promise<void> {
    const { error } = await (supabase as any).rpc('withdraw_discount_request', {
      p_request_id: requestId,
    });

    if (error) {
      throw new Error(error.message || 'Failed to withdraw discount request.');
    }
  },

  /**
   * Accept seller's counter offer atomically
   */
  async acceptCounterOffer(
    requestId: string,
  ): Promise<{ appliedDiscount: number; newTotal: number }> {
    const { data, error } = await (supabase as any).rpc('accept_counter_offer', {
      p_request_id: requestId,
    });

    if (error) {
      throw new Error(error.message || 'Failed to accept counter offer.');
    }

    return {
      appliedDiscount: Number(data?.applied_discount || 0),
      newTotal: Number(data?.new_total || 0),
    };
  },

  /**
   * Fetch discount requests with server-side lazy expiry
   */
  async fetchDiscountRequests(orderId: string): Promise<DiscountRequestRecord[]> {
    const { data, error } = await (supabase as any).rpc('list_discount_requests', {
      p_order_id: orderId,
    });

    if (error) {
      throw new Error(error.message || 'Failed to load discount requests.');
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      shopId: row.shop_id,
      orderId: row.order_id,
      orderItemId: row.order_item_id,
      requestedType: row.requested_type,
      requestedValue: Number(row.requested_value || 0),
      message: row.message,
      status: row.status,
      counterValue: row.counter_value !== null ? Number(row.counter_value) : null,
      counterType: row.counter_type,
      sellerNote: row.seller_note,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  /**
   * Compute seconds remaining against server expires_at
   */
  getSecondsRemaining(expiresAt: string): number {
    const target = new Date(expiresAt).getTime();
    const now = Date.now();
    return Math.max(0, Math.floor((target - now) / 1000));
  },
};
