export type ReturnReason = 'damaged' | 'wrong_item' | 'expired' | 'short_delivery';

export type ReturnStatus = 'pending' | 'approved' | 'partially_approved' | 'rejected';

export interface ReturnItemDraft {
  orderItemId: string;
  productName: string;
  variantTitle: string;
  unitPrice: number;
  qty: number;
  reason: ReturnReason;
  photos: string[];
}

export interface ReturnItemRecord {
  id: string;
  returnId: string;
  orderItemId: string;
  productName: string;
  variantTitle: string;
  unitPrice: number;
  qty: number;
  reason: ReturnReason;
  photos: string[];
  refundAmount: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface ReturnRecord {
  id: string;
  shopId: string;
  orderId: string;
  orderNumber?: string | null;
  returnNumber: string;
  status: ReturnStatus;
  totalRefundAmount: number;
  creditNoteId?: string | null;
  sellerNote?: string | null;
  items?: ReturnItemRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface EligibleOrderItem {
  orderItemId: string;
  variantId?: string | null;
  productName: string;
  variantTitle: string;
  unitPrice: number;
  deliveredQty: number;
  returnedQty: number;
  returnableQty: number;
}

export interface EligibleOrder {
  id: string;
  orderNumber: string;
  totalAmount: number;
  createdAt: string;
  orderStatus: string;
  returnDeadline: string;
  items: EligibleOrderItem[];
}

export interface EmptiesItemSummary {
  issued: number;
  returned: number;
  balance: number;
  depositRate: number;
}

export interface EmptiesSummary {
  bottles: EmptiesItemSummary;
  crates: EmptiesItemSummary;
  totalDepositHeld: number;
}
