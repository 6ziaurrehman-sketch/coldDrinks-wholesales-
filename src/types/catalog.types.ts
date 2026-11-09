export type SaleUnit = 'carton' | 'case' | 'shrink' | 'pack' | 'single';
export type AvailabilityStatus = 'in_stock' | 'low_stock' | 'out_of_stock';
export type CatalogSort = 'name' | 'price' | 'popularity';

export interface CatalogItem {
  variantId: string;
  productId: string;
  brand: string;
  name: string;
  imageUrl: string | null;
  category: string;
  saleUnit: SaleUnit;
  piecesPerUnit: number;
  normalPrice: number;
  shopPrice: number;
  availability: AvailabilityStatus;
  minQty: number;
  maxQty: number;
  qtyMultiple: number;
  isFavorite: boolean;
}

export interface CatalogFilters {
  brandId: string | null;
  categoryId: string | null;
  availability: AvailabilityStatus | null;
}

export interface BrandOption {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
}
