export interface HomeFeedSection<T> {
  data: T | null;
  error: string | null;
}

export interface ActiveOrderSummary {
  id: string;
  orderNumber: number;
  status: string;
  total: number;
  expectedDelivery: string | null;
  itemCount: number;
}

export interface LastOrderSummary {
  id: string;
  orderNumber: number;
  total: number;
  itemCount: number;
  createdAt: string;
}

export interface CreditAlert {
  creditLimit: number;
  used: number;
  available: number;
  overdue: boolean;
}

export interface Banner {
  id: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  linkType: string | null;
  linkTarget: string | null;
}

export interface ProductTile {
  variantId: string;
  productId: string;
  brand: string;
  name: string;
  imageUrl: string | null;
  saleUnit: string;
  piecesPerUnit: number;
  normalPrice: number;
  shopPrice: number;
  availability: 'in_stock' | 'low_stock' | 'out_of_stock';
  minQty: number;
  maxQty: number;
  qtyMultiple: number;
}

export interface BrandTile {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface CategoryTile {
  id: string;
  name: string;
  iconName: string | null;
}

export interface HomeFeed {
  activeOrders: HomeFeedSection<ActiveOrderSummary[]>;
  lastOrder: HomeFeedSection<LastOrderSummary>;
  creditAlert: HomeFeedSection<CreditAlert>;
  banners: HomeFeedSection<Banner[]>;
  recentAndFavorites: HomeFeedSection<ProductTile[]>;
  popularProducts: HomeFeedSection<ProductTile[]>;
  brands: HomeFeedSection<BrandTile[]>;
  categories: HomeFeedSection<CategoryTile[]>;
}
