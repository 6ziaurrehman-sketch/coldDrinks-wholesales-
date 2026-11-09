export interface ProductDetail {
  variantId: string;
  productId: string;
  brand: string;
  name: string;
  images: string[];
  saleUnit: string;
  piecesPerUnit: number;
  normalPrice: number;
  shopPrice: number;
  discountBadge: { text: string; color: string } | null;
  bulkTiers: { minQty: number; price: number }[];
  minQty: number;
  maxQty: number;
  qtyMultiple: number;
  availability: 'in_stock' | 'low_stock' | 'out_of_stock';
  depositInfo: { amount: number; description: string } | null;
  isFavorite: boolean;
  category: string;
}

export interface QtyValidation {
  valid: boolean;
  message: string | null;
  adjustedQty: number | null;
}
