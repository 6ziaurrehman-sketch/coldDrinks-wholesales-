export interface CartItem {
  id: string;
  variantId: string;
  productId: string;
  name: string;
  brand: string;
  images: string[];
  saleUnit: string;
  qty: number;
  shopPrice: number;
  normalPrice: number;
  isAvailable: boolean;
}

export interface CartTotals {
  subtotal: number;
  discounts: number;
  tax: number;
  deliveryFee: number;
  deposits: number;
  total: number;
}

export interface CartIssue {
  id: string;
  type: string;
  message: string;
}

export interface CartChange {
  id: string;
  type: 'price_change' | 'qty_adjusted' | 'unavailable' | 'deactivated';
  message: string;
  oldPrice?: number;
  newPrice?: number;
}
