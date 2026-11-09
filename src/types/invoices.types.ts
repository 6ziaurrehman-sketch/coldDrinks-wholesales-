export type InvoiceStatus = 'unpaid' | 'partially_paid' | 'paid' | 'voided';

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  variantId?: string | null;
  productName: string;
  variantTitle: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  createdAt: string;
}

export interface ReceiptRecord {
  id: string;
  shopId: string;
  paymentId: string;
  invoiceId?: string | null;
  receiptNumber: string;
  amount: number;
  paymentMethod: string;
  referenceNumber?: string | null;
  pdfStoragePath?: string | null;
  createdAt: string;
}

export interface CreditNoteRecord {
  id: string;
  shopId: string;
  invoiceId?: string | null;
  orderId?: string | null;
  creditNoteNumber: string;
  amount: number;
  reason: string;
  status: 'active' | 'applied' | 'refunded';
  pdfStoragePath?: string | null;
  createdAt: string;
  createdBy?: string | null;
}

export interface InvoiceRecord {
  id: string;
  shopId: string;
  orderId?: string | null;
  orderNumber?: string | null;
  invoiceNumber: string;
  version: number;
  status: InvoiceStatus;
  subtotal: number;
  discounts: number;
  tax: number;
  deliveryCharge: number;
  deposits: number;
  total: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate?: string | null;
  pdfStoragePath?: string | null;
  pdfGeneratedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceDetail {
  invoice: InvoiceRecord;
  items: InvoiceItem[];
  receipts: ReceiptRecord[];
  creditNotes: CreditNoteRecord[];
}

export interface ListInvoicesResponse {
  invoices: InvoiceRecord[];
  hasMore: boolean;
  nextCursor: string | null;
  roleDenied?: boolean;
}
