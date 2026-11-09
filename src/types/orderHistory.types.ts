import type { OrderStatus, PaymentStatus, DeliveryStatus, TimelineEntry } from '@/types/orders.types';

export interface OrderHistoryItem {
  id: string;
  orderNumber: number;
  shopId: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  deliveryEta: string | null;
  grandTotal: number | null;
  isFinancialAuthorized: boolean;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
}

export interface OrderHistoryFilters {
  dateRange: {
    from: string | null;
    to: string | null;
  };
  status: OrderStatus[];
  query: string;
}

export interface OrderHistoryDetailItem {
  id: string;
  variantId: string | null;
  productName: string;
  brand: string | null;
  saleUnit: string | null;
  piecesPerUnit: number | null;
  orderedQty: number;
  deliveredQty: number;
  shortfallQty: number;
  unitPrice: number | null;
  lineTotal: number | null;
}

export interface OrderReturnItem {
  id: string;
  status: 'requested' | 'approved' | 'rejected' | 'completed';
  reason: string;
  refundAmount: number | null;
  createdAt: string;
}

export interface OrderPaymentDetail {
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  subtotal: number | null;
  discountTotal: number | null;
  taxTotal: number | null;
  deliveryFee: number | null;
  grandTotal: number | null;
}

export interface OrderHistoryDetail {
  id: string;
  orderNumber: number;
  shopId: string;
  shopName: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  deliveryEta: string | null;
  deliveryAddress: string | null;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  isFinancialAuthorized: boolean;
  grandTotal: number | null;
  invoiceUrl: string | null;
  isInvoiceAvailable: boolean;
  createdAt: string;
  updatedAt: string;
  items: OrderHistoryDetailItem[];
  statusHistory: TimelineEntry[];
  payment: OrderPaymentDetail;
  returns: OrderReturnItem[];
}
