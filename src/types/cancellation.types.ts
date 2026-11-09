export type CancellationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export type CancellationOutcome = 'CANCELLED' | 'REQUEST_CREATED';

export interface CancellationRequest {
  id: string;
  orderId: string;
  shopId: string;
  userId: string;
  status: CancellationStatus;
  feeEstimate: number;
  feeApplied?: number | null;
  reason: string;
  sellerNote?: string | null;
  idempotencyKey?: string | null;
  createdAt: string;
  decidedAt?: string | null;
  decidedBy?: string | null;
}

export interface CancellationPreview {
  orderId: string;
  orderNumber?: number;
  currentStatus: string;
  canCancel: boolean;
  outcome: CancellationOutcome;
  requiresApproval: boolean;
  feeEstimate: number;
  notice: string;
  reason?: string;
  hasPendingRequest: boolean;
  pendingRequest?: Partial<CancellationRequest> | null;
}

export interface CancellationResult {
  outcome: CancellationOutcome;
  orderId: string;
  orderStatus: string;
  requestId?: string;
  feeAmount: number;
  message: string;
}
