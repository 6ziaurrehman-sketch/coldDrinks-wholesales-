export interface ReorderReplacementVariant {
  variantId: string;
  productName: string;
  saleUnit: string;
  currentPrice: number;
  stockStatus: string;
}

export interface ReorderLineItem {
  lineId: string;
  variantId: string | null;
  productName: string;
  brand: string | null;
  saleUnit: string;
  originalQty: number;
  adjustedQty: number;
  originalPrice: number;
  currentPrice: number;
  isAvailable: boolean;
  stockStatus: string;
  minQty: number | null;
  maxQty: number | null;
  qtyMultiple: number | null;
  flags: {
    available: boolean;
    unavailable: boolean;
    qty_adjusted: boolean;
    price_changed: boolean;
  };
  qtyAdjustedReason: string | null;
  suggestedReplacements: ReorderReplacementVariant[];
}

export interface ReorderPreviewData {
  orderId: string;
  orderNumber: number;
  shopId: string;
  totalItems: number;
  availableItems: number;
  unavailableItems: number;
  adjustedItems: number;
  lines: ReorderLineItem[];
}

export interface ReorderSelection {
  variantId: string;
  qty: number;
  skip: boolean;
  replacementVariantId?: string | null;
}

export interface RecentProductItem {
  variantId: string;
  productName: string;
  brandName: string | null;
  imageUrl: string | null;
  saleUnit: string;
  piecesPerUnit: number;
  currentPrice: number;
  stockStatus: string;
  isAvailable: boolean;
  minQty: number;
  maxQty: number;
  qtyMultiple: number;
  orderFrequency: number;
  lastOrderedAt: string;
  daysAgo?: number;
  rankingScore: number;
}
