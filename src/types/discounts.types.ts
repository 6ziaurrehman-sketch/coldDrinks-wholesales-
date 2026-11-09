export type DiscountRequestedType = 'percent' | 'amount';

export type DiscountStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'countered'
  | 'accepted'
  | 'expired'
  | 'withdrawn';

export interface DiscountRequestRecord {
  id: string;
  shopId: string;
  orderId: string;
  orderItemId?: string | null;
  requestedType: DiscountRequestedType;
  requestedValue: number;
  message?: string | null;
  status: DiscountStatus;
  counterValue?: number | null;
  counterType?: DiscountRequestedType | null;
  sellerNote?: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDiscountRequestInput {
  orderId: string;
  requestedType: DiscountRequestedType;
  requestedValue: number;
  message?: string;
  expiresInHours?: number;
}

export interface CreateDiscountRequestResult {
  success: boolean;
  requestId: string;
  discountAmount: number;
  expiresAt: string;
}
