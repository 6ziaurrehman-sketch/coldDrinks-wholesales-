import { supabase } from '@/lib/supabase';
import { mapSupabaseError, AppError } from '@/lib/errors';
import type {
  CancellationPreview,
  CancellationRequest,
  CancellationResult,
} from '@/types/cancellation.types';

export class CancellationService {
  /**
   * Preview cancellation: determines if immediate or requires seller approval,
   * calculates estimated fees, checks active request, and provides localized notice.
   */
  async previewCancellation(orderId: string): Promise<CancellationPreview> {
    try {
      const { data, error } = await (supabase.rpc as any)('preview_cancellation', {
        p_order_id: orderId,
      });

      if (error) throw error;
      const res = data as any;

      return {
        orderId: res.orderId,
        orderNumber: res.orderNumber,
        currentStatus: res.currentStatus,
        canCancel: Boolean(res.canCancel),
        outcome: res.outcome,
        requiresApproval: Boolean(res.requiresApproval),
        feeEstimate: Number(res.feeEstimate || 0),
        notice: res.notice || '',
        reason: res.reason,
        hasPendingRequest: Boolean(res.hasPendingRequest),
        pendingRequest: res.pendingRequest
          ? {
              id: res.pendingRequest.id,
              status: res.pendingRequest.status,
              feeEstimate: Number(res.pendingRequest.feeEstimate || 0),
              reason: res.pendingRequest.reason,
              createdAt: res.pendingRequest.createdAt,
            }
          : null,
      };
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'previewCancellation' });
    }
  }

  /**
   * Submit order cancellation or cancellation request atomically
   */
  async cancelOrder(
    orderId: string,
    reason: string,
    idempotencyKey?: string,
  ): Promise<CancellationResult> {
    const cleanReason = reason?.trim();
    if (!cleanReason) {
      throw new AppError({
        code: 'INVALID_REASON',
        message: 'A cancellation reason is required.',
      });
    }

    try {
      const { data, error } = await (supabase.rpc as any)('cancel_order', {
        p_order_id: orderId,
        p_reason: cleanReason,
        p_idempotency_key: idempotencyKey || null,
      });

      if (error) throw error;
      const res = data as any;

      return {
        outcome: res.outcome,
        orderId: res.orderId,
        orderStatus: res.orderStatus,
        requestId: res.requestId,
        feeAmount: Number(res.feeAmount || 0),
        message: res.message || '',
      };
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'cancelOrder', isWrite: true });
    }
  }

  /**
   * Fetch cancellation requests for a shop or specific order
   */
  async fetchCancellationRequests(
    shopId: string,
    orderId?: string,
  ): Promise<CancellationRequest[]> {
    try {
      const { data, error } = await (supabase.rpc as any)('list_cancellation_requests', {
        p_shop_id: shopId,
        p_order_id: orderId || null,
      });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.id,
        orderId: row.order_id,
        shopId: row.shop_id,
        userId: row.user_id,
        status: row.status,
        feeEstimate: Number(row.fee_estimate || 0),
        feeApplied: row.fee_applied !== null ? Number(row.fee_applied) : null,
        reason: row.reason,
        sellerNote: row.seller_note,
        idempotencyKey: row.idempotency_key,
        createdAt: row.created_at,
        decidedAt: row.decided_at,
        decidedBy: row.decided_by,
      }));
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'fetchCancellationRequests' });
    }
  }

  /**
   * Decide on a cancellation request (approve or reject)
   */
  async decideCancellationRequest(params: {
    requestId: string;
    decision: 'approved' | 'rejected';
    sellerNote?: string;
    feeApplied?: number;
  }): Promise<void> {
    try {
      const { error } = await (supabase.rpc as any)('decide_cancellation_request', {
        p_request_id: params.requestId,
        p_decision: params.decision,
        p_seller_note: params.sellerNote || null,
        p_fee_applied: params.feeApplied ?? null,
      });

      if (error) throw error;
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'decideCancellationRequest', isWrite: true });
    }
  }
}

export const cancellationService = new CancellationService();
