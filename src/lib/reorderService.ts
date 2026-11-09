import { supabase } from '@/lib/supabase';
import { mapSupabaseError } from '@/lib/errors';
import type {
  ReorderPreviewData,
  ReorderSelection,
  RecentProductItem,
} from '@/types/reorder.types';

export class ReorderService {
  /**
   * Load reorder preview with current prices, rules, and suggested replacements
   */
  async getReorderPreview(orderId: string): Promise<ReorderPreviewData> {
    try {
      const { data, error } = await (supabase.rpc as any)('reorder_preview', {
        p_order_id: orderId,
      });

      if (error) throw error;
      const res = data as any;

      return {
        orderId: res.orderId,
        orderNumber: res.orderNumber,
        shopId: res.shopId,
        totalItems: Number(res.totalItems || 0),
        availableItems: Number(res.availableItems || 0),
        unavailableItems: Number(res.unavailableItems || 0),
        adjustedItems: Number(res.adjustedItems || 0),
        lines: (res.lines || []).map((l: any) => ({
          lineId: l.lineId,
          variantId: l.variantId || null,
          productName: l.productName,
          brand: l.brand,
          saleUnit: l.saleUnit,
          originalQty: Number(l.originalQty || 0),
          adjustedQty: Number(l.adjustedQty || 0),
          originalPrice: Number(l.originalPrice || 0),
          currentPrice: Number(l.currentPrice || 0),
          isAvailable: Boolean(l.isAvailable),
          stockStatus: l.stockStatus || 'out_of_stock',
          minQty: l.minQty !== null ? Number(l.minQty) : null,
          maxQty: l.maxQty !== null ? Number(l.maxQty) : null,
          qtyMultiple: l.qtyMultiple !== null ? Number(l.qtyMultiple) : null,
          flags: {
            available: Boolean(l.flags?.available),
            unavailable: Boolean(l.flags?.unavailable),
            qty_adjusted: Boolean(l.flags?.qty_adjusted),
            price_changed: Boolean(l.flags?.price_changed),
          },
          qtyAdjustedReason: l.qtyAdjustedReason || null,
          suggestedReplacements: (l.suggestedReplacements || []).map((r: any) => ({
            variantId: r.variantId,
            productName: r.productName,
            saleUnit: r.saleUnit,
            currentPrice: Number(r.currentPrice || 0),
            stockStatus: r.stockStatus,
          })),
        })),
      };
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'getReorderPreview' });
    }
  }

  /**
   * Apply reorder selections into active cart with idempotent merging
   */
  async applyReorder(
    orderId: string,
    selections: ReorderSelection[],
  ): Promise<{ cartId: string; addedCount: number; skippedCount: number }> {
    try {
      const { data, error } = await (supabase.rpc as any)('reorder_apply', {
        p_order_id: orderId,
        p_selections: selections,
      });

      if (error) throw error;
      const res = data as any;

      return {
        cartId: res.cartId,
        addedCount: Number(res.addedCount || 0),
        skippedCount: Number(res.skippedCount || 0),
      };
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'applyReorder', isWrite: true });
    }
  }

  /**
   * Fetch recent products ranked by recency + frequency formula
   */
  async fetchRecentProducts(shopId: string, limit = 20): Promise<RecentProductItem[]> {
    try {
      const { data, error } = await (supabase.rpc as any)('recent_products', {
        p_shop_id: shopId,
        p_limit: limit,
      });

      if (error) throw error;

      return (data || []).map((r: any) => ({
        variantId: r.variantId,
        productName: r.productName,
        brandName: r.brandName,
        imageUrl: r.imageUrl,
        saleUnit: r.saleUnit,
        piecesPerUnit: Number(r.piecesPerUnit || 1),
        currentPrice: Number(r.currentPrice || 0),
        stockStatus: r.stockStatus,
        isAvailable: Boolean(r.isAvailable),
        minQty: Number(r.minQty || 1),
        maxQty: Number(r.maxQty || 999),
        qtyMultiple: Number(r.qtyMultiple || 1),
        orderFrequency: Number(r.orderFrequency || 1),
        lastOrderedAt: r.lastOrderedAt,
        daysAgo: Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(r.lastOrderedAt).getTime()) / (1000 * 60 * 60 * 24),
          ),
        ),
        rankingScore: Number(r.rankingScore || 0),
      }));
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'fetchRecentProducts' });
    }
  }

  /**
   * Toggle favorite variant for shop
   */
  async toggleFavorite(shopId: string, variantId: string): Promise<boolean> {
    try {
      const { data, error } = await (supabase.rpc as any)('toggle_favorite', {
        p_shop_id: shopId,
        p_variant_id: variantId,
      });

      if (error) throw error;
      return Boolean((data as any)?.is_favorite);
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'toggleFavorite', isWrite: true });
    }
  }

  /**
   * Fetch all favorite variant IDs for shop
   */
  async fetchFavorites(shopId: string): Promise<string[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('favorites')
        .select('variant_id')
        .eq('shop_id', shopId);

      if (error) throw error;
      return (data || []).map((row: any) => row.variant_id);
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'fetchFavorites' });
    }
  }
}

export const reorderService = new ReorderService();
