import { supabase } from '@/lib/supabase';
import { mapSupabaseError } from '@/lib/errors';
import type { OrderSummaryItem, OrderTrackingInfo } from '@/types/orders.types';

export class OrdersService {
  /**
   * Fetch active orders for the shop
   */
  async fetchActiveOrders(shopId: string): Promise<OrderSummaryItem[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('orders')
        .select('id, order_number, shop_id, order_status, payment_status, delivery_status, delivery_eta, grand_total, created_at, updated_at')
        .eq('shop_id', shopId)
        .not('order_status', 'in', '("delivered","cancelled","rejected")')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.id,
        orderNumber: row.order_number,
        shopId: row.shop_id,
        orderStatus: row.order_status,
        paymentStatus: row.payment_status,
        deliveryStatus: row.delivery_status,
        deliveryEta: row.delivery_eta || null,
        grandTotal: Number(row.grand_total || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'fetchActiveOrders' });
    }
  }

  /**
   * Get full order tracking info including timeline, delivery status, and items comparison
   */
  async getOrderTracking(orderId: string): Promise<OrderTrackingInfo> {
    try {
      const { data, error } = await (supabase.rpc as any)('get_order_tracking', {
        p_order_id: orderId,
      });

      if (error) throw error;
      const res = data as any;

      return {
        orderId: res.orderId,
        orderNumber: res.orderNumber,
        shopId: res.shopId,
        shopName: res.shopName,
        orderStatus: res.orderStatus,
        paymentStatus: res.paymentStatus,
        deliveryStatus: res.deliveryStatus,
        deliveryStatusLine: res.deliveryStatusLine,
        deliveryEta: res.deliveryEta,
        failureReason: res.failureReason,
        rescheduledDate: res.rescheduledDate,
        deliveryAddress: res.deliveryAddress,
        contactName: res.contactName,
        contactPhone: res.contactPhone,
        grandTotal: Number(res.grandTotal || 0),
        createdAt: res.createdAt,
        updatedAt: res.updatedAt,
        timeline: (res.timeline || []).map((t: any) => ({
          id: t.id,
          status: t.status,
          statusType: t.statusType,
          fromStatus: t.fromStatus,
          toStatus: t.toStatus,
          actorRole: t.actorRole,
          notes: t.notes,
          createdAt: t.createdAt,
        })),
        items: (res.items || []).map((item: any) => ({
          id: item.id,
          productName: item.productName,
          brand: item.brand,
          saleUnit: item.saleUnit,
          piecesPerUnit: item.piecesPerUnit,
          orderedQty: item.orderedQty,
          deliveredQty: item.deliveredQty,
          shortfallQty: item.shortfallQty,
          unitPrice: Number(item.unitPrice || 0),
          lineTotal: Number(item.lineTotal || 0),
        })),
      };
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'getOrderTracking' });
    }
  }

  /**
   * Reschedule order delivery date/slot
   */
  async rescheduleDelivery(params: {
    orderId: string;
    newDate: string;
    slotId?: string;
    notes?: string;
  }): Promise<void> {
    try {
      const { error } = await (supabase.rpc as any)('reschedule_order_delivery', {
        p_order_id: params.orderId,
        p_new_date: params.newDate,
        p_slot_id: params.slotId ?? null,
        p_notes: params.notes ?? null,
      });

      if (error) throw error;
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'rescheduleDelivery', isWrite: true });
    }
  }

  /**
   * Cancel order after a delivery failure
   */
  async cancelAfterFailedDelivery(params: {
    orderId: string;
    reason?: string;
  }): Promise<void> {
    try {
      const { error } = await (supabase.rpc as any)('cancel_after_failed_delivery', {
        p_order_id: params.orderId,
        p_reason: params.reason ?? 'Customer requested cancellation',
      });

      if (error) throw error;
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'cancelAfterFailedDelivery', isWrite: true });
    }
  }

  /**
   * Request / cancel order prior to delivery
   */
  async cancelOrder(params: {
    orderId: string;
    reason?: string;
  }): Promise<void> {
    try {
      const { error } = await (supabase.rpc as any)('cancel_after_failed_delivery', {
        p_order_id: params.orderId,
        p_reason: params.reason ?? 'Customer requested order cancellation',
      });

      if (error) throw error;
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'cancelOrder', isWrite: true });
    }
  }

  /**
   * Submit payment proof reference/details
   */
  async submitPaymentProof(params: {
    orderId: string;
    reference: string;
    notes?: string;
  }): Promise<void> {
    try {
      const { error } = await (supabase as any)
        .from('orders')
        .update({
          payment_status: 'proof_submitted',
          notes: params.notes ? `Payment Proof: ${params.reference} - ${params.notes}` : `Payment Proof: ${params.reference}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.orderId);

      if (error) throw error;
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'submitPaymentProof', isWrite: true });
    }
  }
}

export const ordersService = new OrdersService();
