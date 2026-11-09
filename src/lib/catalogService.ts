import { supabase } from '@/lib/supabase';
import { CatalogItem, CatalogSort, BrandOption, CategoryOption } from '@/types/catalog.types';
import { mapSupabaseError } from '@/lib/errors';
import { SEED_CATALOG_ITEMS, SEED_BRANDS, SEED_CATEGORIES } from '@/data/catalogSeed';

export interface FetchCatalogParams {
  shopId: string;
  query: string;
  brandId: string | null;
  categoryId: string | null;
  availability: string | null;
  sort: CatalogSort;
  cursor: string | null;
  limit: number;
}

function filterAndSortSeedCatalog(params: FetchCatalogParams): { items: CatalogItem[]; nextCursor: string | null } {
  let filtered = [...SEED_CATALOG_ITEMS];

  if (params.query) {
    const q = params.query.toLowerCase();
    filtered = filtered.filter(
      (item) => item.name.toLowerCase().includes(q) || item.brand.toLowerCase().includes(q)
    );
  }

  if (params.brandId) {
    const brand = SEED_BRANDS.find((b) => b.id === params.brandId);
    if (brand) {
      filtered = filtered.filter((item) => item.brand.toLowerCase() === brand.name.toLowerCase());
    }
  }

  if (params.categoryId) {
    const cat = SEED_CATEGORIES.find((c) => c.id === params.categoryId);
    if (cat) {
      filtered = filtered.filter((item) => item.category.toLowerCase() === cat.name.toLowerCase());
    }
  }

  if (params.availability) {
    filtered = filtered.filter((item) => item.availability === params.availability);
  }

  if (params.sort === 'price') {
    filtered.sort((a, b) => a.shopPrice - b.shopPrice);
  } else if (params.sort === 'popularity') {
    filtered.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
  } else {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  const limit = params.limit || 50;
  const items = filtered.slice(0, limit);
  const nextCursor = filtered.length > limit ? filtered[limit - 1].variantId : null;

  return { items, nextCursor };
}

export async function fetchCatalog(params: FetchCatalogParams): Promise<{ items: CatalogItem[]; nextCursor: string | null }> {
  try {
    const { data, error } = await (supabase.rpc as any)('catalog_for_shop', {
      p_shop_id: params.shopId,
      p_query: params.query || null,
      p_brand_id: params.brandId,
      p_category_id: params.categoryId,
      p_availability: params.availability,
      p_sort: params.sort,
      p_cursor: params.cursor,
      p_limit: params.limit,
    });

    if (error) {
      return filterAndSortSeedCatalog(params);
    }
    
    const rawList = Array.isArray(data) ? data : [];
    if (rawList.length === 0) {
      return filterAndSortSeedCatalog(params);
    }

    let nextCursor: string | null = null;
    const items = rawList.map((item, index) => {
      if (index === rawList.length - 1) {
        nextCursor = item.cursor || null;
      }
      return {
        variantId: item.variant_id,
        productId: item.product_id,
        brand: item.brand_name,
        name: item.product_name,
        imageUrl: item.image_url,
        category: item.category_name,
        saleUnit: item.sale_unit,
        piecesPerUnit: item.pieces_per_unit,
        normalPrice: item.normal_price,
        shopPrice: item.shop_price,
        availability: item.availability,
        minQty: item.min_qty,
        maxQty: item.max_qty,
        qtyMultiple: item.qty_multiple,
        isFavorite: item.is_favorite,
      };
    });

    return { items, nextCursor };
  } catch {
    return filterAndSortSeedCatalog(params);
  }
}

export async function fetchBrands(): Promise<BrandOption[]> {
  try {
    const { data, error } = await (supabase as any).from('brands').select('id, name, logo_url').order('name');
    if (error || !data || (data as any[]).length === 0) {
      return SEED_BRANDS;
    }
    return (data || []).map((b: any) => ({ id: b.id, name: b.name, logoUrl: b.logo_url }));
  } catch {
    return SEED_BRANDS;
  }
}

export async function fetchCategories(): Promise<CategoryOption[]> {
  try {
    const { data, error } = await (supabase as any).from('categories').select('id, name, parent_id').order('name');
    if (error || !data || (data as any[]).length === 0) {
      return SEED_CATEGORIES;
    }
    return (data || []).map((c: any) => ({ id: c.id, name: c.name, parentId: c.parent_id }));
  } catch {
    return SEED_CATEGORIES;
  }
}

export async function toggleFavorite(shopId: string, variantId: string, isFavorite: boolean): Promise<void> {
  try {
    const { error } = await (supabase.rpc as any)('toggle_favorite', {
      p_shop_id: shopId,
      p_variant_id: variantId,
      p_is_favorite: isFavorite,
    });
    if (error) throw error;
  } catch (error) {
    throw mapSupabaseError(error, { actionName: 'toggleFavorite', isWrite: true });
  }
}

export async function toggleNotifyMe(shopId: string, variantId: string, notify: boolean): Promise<void> {
  try {
    const { error } = await (supabase.rpc as any)('toggle_notify_me', {
      p_shop_id: shopId,
      p_variant_id: variantId,
      p_notify: notify,
    });
    if (error) throw error;
  } catch (error) {
    throw mapSupabaseError(error, { actionName: 'toggleNotifyMe', isWrite: true });
  }
}
