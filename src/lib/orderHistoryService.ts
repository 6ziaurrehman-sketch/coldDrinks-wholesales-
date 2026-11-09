import { supabase } from '@/lib/supabase';
import { mapSupabaseError, AppError } from '@/lib/errors';
import type {
  OrderHistoryItem,
  OrderHistoryDetail,
  OrderHistoryFilters,
} from '@/types/orderHistory.types';

export interface ListOrdersResult {
  orders: OrderHistoryItem[];
  hasMore: boolean;
  nextCursor: string | null;
}

export class OrderHistoryService {
  /**
   * List orders with keyset pagination, date range, search, and status filtering
   */
  async listOrders(params: {
    shopId: string;
    filters: OrderHistoryFilters;
    cursor?: string | null;
    limit?: number;
  }): Promise<ListOrdersResult> {
    const { shopId, filters, cursor, limit = 20 } = params;

    // Client-side date range validation
    if (filters.dateRange.from && filters.dateRange.to) {
      const fromDate = new Date(filters.dateRange.from).getTime();
      const toDate = new Date(filters.dateRange.to).getTime();
      if (toDate < fromDate) {
        throw new AppError({
          code: 'INVALID_DATE_RANGE',
          message: 'End date cannot be earlier than start date.',
        });
      }
    }

    try {
      const { data, error } = await (supabase.rpc as any)('list_orders', {
        p_shop_id: shopId,
        p_from: filters.dateRange.from || null,
        p_to: filters.dateRange.to || null,
        p_status: filters.status && filters.status.length > 0 ? filters.status : null,
        p_search: filters.query ? filters.query.trim() : null,
        p_cursor: cursor || null,
        p_limit: limit,
      });

      if (error) throw error;
      const res = data as any;

      return {
        orders: (res.orders || []).map((row: any) => ({
          id: row.id,
          orderNumber: row.orderNumber,
          shopId: row.shopId,
          orderStatus: row.orderStatus,
          paymentStatus: row.paymentStatus,
          deliveryStatus: row.deliveryStatus,
          deliveryEta: row.deliveryEta || null,
          grandTotal: row.grandTotal !== null ? Number(row.grandTotal) : null,
          isFinancialAuthorized: Boolean(row.isFinancialAuthorized),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          itemCount: Number(row.itemCount || 0),
        })),
        hasMore: Boolean(res.hasMore),
        nextCursor: res.nextCursor || null,
      };
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'listOrders' });
    }
  }

  /**
   * Fetch full order detail with items, status history, payment, returns, and invoice link
   */
  async getOrderDetail(orderId: string): Promise<OrderHistoryDetail> {
    try {
      const { data, error } = await (supabase.rpc as any)('get_order_detail', {
        p_order_id: orderId,
      });

      if (error) throw error;
      const res = data as any;

      return {
        id: res.id,
        orderNumber: res.orderNumber,
        shopId: res.shopId,
        shopName: res.shopName,
        orderStatus: res.orderStatus,
        paymentStatus: res.paymentStatus,
        deliveryStatus: res.deliveryStatus,
        deliveryEta: res.deliveryEta,
        deliveryAddress: res.deliveryAddress,
        contactName: res.contactName,
        contactPhone: res.contactPhone,
        notes: res.notes,
        isFinancialAuthorized: Boolean(res.isFinancialAuthorized),
        grandTotal: res.grandTotal !== null ? Number(res.grandTotal) : null,
        invoiceUrl: res.invoiceUrl || null,
        isInvoiceAvailable: Boolean(res.isInvoiceAvailable),
        createdAt: res.createdAt,
        updatedAt: res.updatedAt,
        items: (res.items || []).map((i: any) => ({
          id: i.id,
          variantId: i.variantId || null,
          productName: i.productName,
          brand: i.brand,
          saleUnit: i.saleUnit,
          piecesPerUnit: i.piecesPerUnit,
          orderedQty: Number(i.orderedQty || 0),
          deliveredQty: Number(i.deliveredQty || 0),
          shortfallQty: Number(i.shortfallQty || 0),
          unitPrice: i.unitPrice !== null ? Number(i.unitPrice) : null,
          lineTotal: i.lineTotal !== null ? Number(i.lineTotal) : null,
        })),
        statusHistory: (res.statusHistory || []).map((h: any) => ({
          id: h.id,
          status: h.status,
          statusType: h.statusType || 'order_status',
          fromStatus: null,
          toStatus: h.status,
          actorRole: h.actorRole || null,
          notes: h.notes || null,
          createdAt: h.createdAt,
        })),
        payment: {
          paymentMethod: res.payment?.paymentMethod || 'cash',
          paymentStatus: res.payment?.paymentStatus || 'unpaid',
          subtotal: res.payment?.subtotal !== null ? Number(res.payment?.subtotal) : null,
          discountTotal: res.payment?.discountTotal !== null ? Number(res.payment?.discountTotal) : null,
          taxTotal: res.payment?.taxTotal !== null ? Number(res.payment?.taxTotal) : null,
          deliveryFee: res.payment?.deliveryFee !== null ? Number(res.payment?.deliveryFee) : null,
          grandTotal: res.payment?.grandTotal !== null ? Number(res.payment?.grandTotal) : null,
        },
        returns: (res.returns || []).map((r: any) => ({
          id: r.id,
          status: r.status,
          reason: r.reason,
          refundAmount: r.refundAmount !== null ? Number(r.refundAmount) : null,
          createdAt: r.createdAt,
        })),
      };
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'getOrderDetail' });
    }
  }

  /**
   * Request a return for delivered items
   */
  async requestReturn(params: {
    orderId: string;
    shopId: string;
    reason: string;
    items?: any[];
  }): Promise<void> {
    try {
      const { error } = await (supabase as any)
        .from('order_returns')
        .insert({
          order_id: params.orderId,
          shop_id: params.shopId,
          reason: params.reason,
          items: params.items || [],
        });

      if (error) throw error;
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'requestReturn', isWrite: true });
    }
  }
}

export const orderHistoryService = new OrderHistoryService();
