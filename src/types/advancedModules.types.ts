export type PromotionType = 'banner' | 'bulk' | 'exclusive' | 'limited_time';
export type DiscountType = 'percent' | 'amount';
export type EligibilityTier = 'all' | 'bronze' | 'silver' | 'gold' | 'platinum';

export interface Promotion {
  id: string;
  code?: string | null;
  title: string;
  description?: string | null;
  type: PromotionType;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount: number;
  targetBrand?: string | null;
  targetCategoryId?: string | null;
  targetVariantId?: string | null;
  stackable: boolean;
  priority: number;
  bannerImageUrl?: string | null;
  deepLinkRoute?: string | null;
  endsAt: string;
  serverNow: string;
}

export interface AppliedPromotion {
  promotion: Promotion;
  discountAmount: number;
  label: string;
}

export interface OrderFeedback {
  id: string;
  orderId: string;
  deliveryRating: number;
  serviceRating: number;
  comments?: string;
  createdAt: string;
}

export interface BulkParsedLine {
  rawLine: string;
  status: 'ok' | 'ambiguous' | 'unrecognised' | 'invalid_qty' | 'unavailable';
  variantId?: string;
  variantName?: string;
  productName?: string;
  unitPrice?: number;
  parsedQty: number;
  saleUnit?: string;
  packSize?: number;
  confidence: number;
  candidates?: {
    variantId: string;
    variantName: string;
    productName: string;
    unitPrice: number;
    packSize: number;
  }[];
}

export interface OrderTemplate {
  id: string;
  shopId: string;
  name: string;
  createdBy: string;
  isShared: boolean;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  items?: {
    id: string;
    variantId: string;
    quantity: number;
    variantName?: string;
    productName?: string;
    unitPrice?: number;
    imageUrl?: string;
  }[];
}

export interface ScheduledOrder {
  id: string;
  shopId: string;
  addressId?: string | null;
  paymentMethod: 'cash' | 'credit' | 'bank_transfer';
  ruleType: 'weekly' | 'monthly' | 'specific_date';
  ruleDay?: number | null;
  deliveryTimeSlot: string;
  nextRunAt: string;
  status: 'active' | 'paused' | 'cancelled';
  templateId?: string | null;
  items: {
    variantId: string;
    quantity: number;
    title?: string;
  }[];
  createdBy: string;
  createdAt: string;
}

export interface PurchaseAllowance {
  hasLimit: boolean;
  allowed: boolean;
  limitQty?: number;
  purchasedQty?: number;
  remaining: number;
  period?: 'day' | 'week' | 'month';
}

export interface LoyaltySummary {
  totalPoints: number;
  rupeeValue: number;
  expiringPoints: number;
  nextExpiry?: string | null;
}

export interface QueuedOfflineAction {
  id: string;
  actionType: 'cart_add' | 'cart_update' | 'cart_remove' | 'favorite_toggle' | 'notes_save';
  payload: any;
  createdAt: string;
  retryCount: number;
}
