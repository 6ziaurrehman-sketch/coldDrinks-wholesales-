import { supabase } from '@/lib/supabase';
import { ProductDetail } from '@/types/productDetail.types';
import { mapSupabaseError } from '@/lib/errors';
import { SEED_CATALOG_ITEMS } from '@/data/catalogSeed';

export const fetchProductDetail = async (variantId: string, shopId: string): Promise<ProductDetail | null> => {
  try {
    const { data, error } = await (supabase.rpc as any)('get_product_detail', { p_variant_id: variantId, p_shop_id: shopId });
    if (!error && data && data.variantId) {
      return data as ProductDetail;
    }
  } catch {
    // Fall back to seed item
  }

  const seed = SEED_CATALOG_ITEMS.find((item) => item.variantId === variantId);
  if (!seed) return null;

  return {
    variantId: seed.variantId,
    productId: seed.productId,
    brand: seed.brand,
    name: seed.name,
    images: seed.imageUrl ? [seed.imageUrl] : [],
    saleUnit: seed.saleUnit,
    piecesPerUnit: seed.piecesPerUnit,
    normalPrice: seed.normalPrice,
    shopPrice: seed.shopPrice,
    discountBadge: null,
    bulkTiers: [],
    minQty: seed.minQty,
    maxQty: seed.maxQty,
    qtyMultiple: seed.qtyMultiple,
    availability: seed.availability,
    depositInfo: null,
    isFavorite: seed.isFavorite,
    category: seed.category,
  };
};

export const toggleFavorite = async (variantId: string, isFavorite: boolean): Promise<void> => {
  try {
    if (isFavorite) {
      const { error } = await (supabase as any).from('favorites').insert({ variant_id: variantId });
      if (error) throw error;
    } else {
      const { error } = await (supabase as any).from('favorites').delete().eq('variant_id', variantId);
      if (error) throw error;
    }
  } catch (err) {
    throw mapSupabaseError(err, { actionName: 'toggleFavorite', isWrite: true });
  }
};

export const toggleNotifyMe = async (variantId: string, notify: boolean): Promise<void> => {
  try {
    if (notify) {
      const { error } = await (supabase as any).from('notifications').insert({ variant_id: variantId, type: 'stock' });
      if (error) throw error;
    } else {
      const { error } = await (supabase as any).from('notifications').delete().eq('variant_id', variantId).eq('type', 'stock');
      if (error) throw error;
    }
  } catch (err) {
    throw mapSupabaseError(err, { actionName: 'toggleNotifyMe', isWrite: true });
  }
};
