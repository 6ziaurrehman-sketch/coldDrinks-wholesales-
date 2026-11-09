export type OrderStatus =
  | 'placed'
  | 'confirmed'
  | 'processing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'partially_delivered'
  | 'cancelled'
  | 'rejected';

export type PaymentStatus =
  | 'unpaid'
  | 'proof_submitted'
  | 'partially_paid'
  | 'paid'
  | 'refunded';

export type DeliveryStatus =
  | 'unassigned'
  | 'assigned'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'rescheduled';

export interface TimelineEntry {
  id: string;
  status: string;
  statusType: 'order_status' | 'delivery_status' | 'payment_status';
  fromStatus: string | null;
  toStatus: string;
  actorRole: string | null;
  notes: string | null;
  createdAt: string;
}

export interface OrderTrackedItem {
  id: string;
  productName: string;
  brand: string | null;
  saleUnit: string | null;
  piecesPerUnit: number | null;
  orderedQty: number;
  deliveredQty: number;
  shortfallQty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderTrackingInfo {
  orderId: string;
  orderNumber: number;
  shopId: string;
  shopName: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  deliveryStatusLine: string;
  deliveryEta: string | null;
  failureReason: string | null;
  rescheduledDate: string | null;
  deliveryAddress: string | null;
  contactName: string | null;
  contactPhone: string | null;
  grandTotal: number;
  createdAt: string;
  updatedAt: string;
  timeline: TimelineEntry[];
  items: OrderTrackedItem[];
}

export interface OrderSummaryItem {
  id: string;
  orderNumber: number;
  shopId: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  deliveryEta?: string | null;
  grandTotal: number;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
}
