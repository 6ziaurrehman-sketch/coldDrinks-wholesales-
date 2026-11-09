export interface DeliverySlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  cutoffTime: string;
  isAvailable: boolean;
}

export interface PaymentMethod {
  id: string;
  type: 'cash' | 'credit' | 'bank_transfer';
  label: string;
}

export interface CreditInfo {
  limit: number;
  used: number;
  available: number;
}

export interface CheckoutQuote {
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
}

export type CheckoutStep = 'address' | 'delivery' | 'payment' | 'review';
