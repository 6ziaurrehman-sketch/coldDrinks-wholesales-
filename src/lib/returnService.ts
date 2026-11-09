import { supabase } from '@/lib/supabase';
import type {
  EligibleOrder,
  EmptiesSummary,
  ReturnItemDraft,
  ReturnRecord,
} from '@/types/returns.types';

export const returnService = {
  /**
   * Fetch eligible delivered orders within the 24-hour return window
   */
  async fetchEligibleOrders(shopId: string): Promise<EligibleOrder[]> {
    const { data, error } = await (supabase as any).rpc('get_return_eligible_orders', {
      p_shop_id: shopId,
    });

    if (error) {
      throw new Error(error.message || 'Failed to fetch eligible orders for return.');
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      orderNumber: row.order_number,
      totalAmount: Number(row.total_amount || 0),
      createdAt: row.created_at,
      orderStatus: row.order_status,
      returnDeadline: row.return_deadline,
      items: (row.items || []).map((it: any) => ({
        orderItemId: it.order_item_id,
        variantId: it.variant_id,
        productName: it.product_name,
        variantTitle: it.variant_title,
        unitPrice: Number(it.unit_price || 0),
        deliveredQty: Number(it.delivered_qty || 0),
        returnedQty: Number(it.returned_qty || 0),
        returnableQty: Number(it.returnable_qty || 0),
      })),
    }));
  },

  /**
   * Upload return proof photo to private 'return-photos' bucket
   */
  async uploadReturnPhoto(
    shopId: string,
    file: { uri: string; name?: string; size?: number },
  ): Promise<string> {
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size && file.size > MAX_SIZE) {
      throw new Error('FILE_TOO_LARGE: Photo cannot exceed 5 MB.');
    }

    const ext = file.name?.split('.').pop() || 'jpg';
    const filePath = `${shopId}/returns/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

    const res = await fetch(file.uri);
    const blob = await res.blob();

    const { error } = await supabase.storage
      .from('return-photos')
      .upload(filePath, blob, {
        contentType: blob.type || 'image/jpeg',
        upsert: false,
      });

    if (error) {
      throw new Error(error.message || 'Failed to upload damaged product photo.');
    }

    return filePath;
  },

  /**
   * Create return request atomically with caps and mandatory photo validation
   */
  async createReturnRequest(
    orderId: string,
    items: ReturnItemDraft[],
    idempotencyKey?: string,
  ): Promise<{ returnId: string; returnNumber: string; totalRefundAmount: number }> {
    const payloadItems = items.map((it) => ({
      order_item_id: it.orderItemId,
      qty: it.qty,
      reason: it.reason,
      photos: it.photos || [],
    }));

    const { data, error } = await (supabase as any).rpc('create_return_request', {
      p_order_id: orderId,
      p_items: payloadItems,
      p_idempotency_key: idempotencyKey || null,
    });

    if (error) {
      throw new Error(error.message || 'Failed to submit return request.');
    }

    return {
      returnId: data?.return_id,
      returnNumber: data?.return_number,
      totalRefundAmount: Number(data?.total_refund_amount || 0),
    };
  },

  /**
   * Fetch submitted returns for a shop
   */
  async fetchReturns(shopId: string): Promise<ReturnRecord[]> {
    const { data, error } = await (supabase as any)
      .from('returns')
      .select('*, return_items(*), orders(order_number)')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message || 'Failed to load return history.');
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      shopId: row.shop_id,
      orderId: row.order_id,
      orderNumber: row.orders?.order_number,
      returnNumber: row.return_number,
      status: row.status,
      totalRefundAmount: Number(row.total_refund_amount || 0),
      creditNoteId: row.credit_note_id,
      sellerNote: row.seller_note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      items: (row.return_items || []).map((ri: any) => ({
        id: ri.id,
        returnId: ri.return_id,
        orderItemId: ri.order_item_id,
        productName: ri.product_name,
        variantTitle: ri.variant_title,
        unitPrice: Number(ri.unit_price || 0),
        qty: Number(ri.qty || 0),
        reason: ri.reason,
        photos: ri.photos || [],
        refundAmount: Number(ri.refund_amount || 0),
        status: ri.status,
        createdAt: ri.created_at,
      })),
    }));
  },

  /**
   * Fetch empties ledger balance (bottles & crates)
   */
  async fetchEmptiesSummary(shopId: string): Promise<EmptiesSummary> {
    const { data, error } = await (supabase as any).rpc('get_empties_summary', {
      p_shop_id: shopId,
    });

    if (error) {
      throw new Error(error.message || 'Failed to load empties balance.');
    }

    return {
      bottles: {
        issued: Number(data?.bottles?.issued || 0),
        returned: Number(data?.bottles?.returned || 0),
        balance: Number(data?.bottles?.balance || 0),
        depositRate: Number(data?.bottles?.deposit_rate || 15),
      },
      crates: {
        issued: Number(data?.crates?.issued || 0),
        returned: Number(data?.crates?.returned || 0),
        balance: Number(data?.crates?.balance || 0),
        depositRate: Number(data?.crates?.deposit_rate || 250),
      },
      totalDepositHeld: Number(data?.total_deposit_held || 0),
    };
  },
};
