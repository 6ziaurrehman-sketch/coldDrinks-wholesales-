import { supabase } from '@/lib/supabase';
import type { AppliedPromotion, Promotion } from '@/types/advancedModules.types';

export const promotionsService = {
  /**
   * Fetch active promotions valid for the current shop
   */
  async fetchActivePromotions(shopId: string): Promise<Promotion[]> {
    const { data, error } = await (supabase as any).rpc('get_active_promotions', {
      p_shop_id: shopId,
    });

    if (error) {
      console.warn('[PromotionsService] fetch error:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      description: row.description,
      type: row.type,
      discountType: row.discount_type,
      discountValue: Number(row.discount_value),
      minOrderAmount: Number(row.min_order_amount),
      targetBrand: row.target_brand,
      targetCategoryId: row.target_category_id,
      targetVariantId: row.target_variant_id,
      stackable: Boolean(row.stackable),
      priority: Number(row.priority),
      bannerImageUrl: row.banner_image_url,
      deepLinkRoute: row.deep_link_route,
      endsAt: row.ends_at,
      serverNow: row.server_now,
    }));
  },

  /**
   * Calculate best promotions for the given cart items and subtotal
   * Stacking rules: Stackable promotions can combine with one best non-stackable promo.
   * If non-stackable compete, the one yielding the greatest discount wins.
   */
  evaluateCartPromotions(
    promotions: Promotion[],
    cartItems: { variantId: string; brand?: string; categoryId?: string; price: number; quantity: number }[],
    subtotal: number,
    serverClockOffsetMs: number = 0,
  ): { appliedPromotions: AppliedPromotion[]; totalDiscount: number; expiredCount: number } {
    const now = Date.now() + serverClockOffsetMs;
    let expiredCount = 0;

    // Filter valid promotions
    const eligiblePromos = promotions.filter((p) => {
      const endsTime = new Date(p.endsAt).getTime();
      if (endsTime <= now) {
        expiredCount++;
        return false;
      }
      if (subtotal < p.minOrderAmount) {
        return false;
      }
      return true;
    });

    if (eligiblePromos.length === 0) {
      return { appliedPromotions: [], totalDiscount: 0, expiredCount };
    }

    // Helper to calculate raw discount of a promo
    const calcPromoDiscount = (p: Promotion): number => {
      let applicableBase = subtotal;

      if (p.targetVariantId) {
        const item = cartItems.find((ci) => ci.variantId === p.targetVariantId);
        applicableBase = item ? item.price * item.quantity : 0;
      } else if (p.targetBrand) {
        applicableBase = cartItems
          .filter((ci) => ci.brand?.toLowerCase() === p.targetBrand?.toLowerCase())
          .reduce((sum, ci) => sum + ci.price * ci.quantity, 0);
      } else if (p.targetCategoryId) {
        applicableBase = cartItems
          .filter((ci) => ci.categoryId === p.targetCategoryId)
          .reduce((sum, ci) => sum + ci.price * ci.quantity, 0);
      }

      if (applicableBase <= 0) return 0;

      if (p.discountType === 'percent') {
        return (applicableBase * p.discountValue) / 100;
      }
      return Math.min(applicableBase, p.discountValue);
    };

    const stackableList: AppliedPromotion[] = [];
    let bestNonStackable: AppliedPromotion | null = null;
    let maxNonStackableVal = 0;

    for (const p of eligiblePromos) {
      const disc = calcPromoDiscount(p);
      if (disc <= 0) continue;

      const appliedItem: AppliedPromotion = {
        promotion: p,
        discountAmount: Math.round(disc),
        label: p.discountType === 'percent' ? `${p.discountValue}% OFF` : `Rs. ${p.discountValue} OFF`,
      };

      if (p.stackable) {
        stackableList.push(appliedItem);
      } else {
        if (disc > maxNonStackableVal) {
          maxNonStackableVal = disc;
          bestNonStackable = appliedItem;
        }
      }
    }

    const finalApplied: AppliedPromotion[] = [...stackableList];
    if (bestNonStackable) {
      finalApplied.push(bestNonStackable);
    }

    const totalDiscount = finalApplied.reduce((sum, a) => sum + a.discountAmount, 0);
    return {
      appliedPromotions: finalApplied,
      totalDiscount,
      expiredCount,
    };
  },
};
