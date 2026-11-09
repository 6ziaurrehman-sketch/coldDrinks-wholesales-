import { supabase } from '@/lib/supabase';
import type { PurchaseAllowance } from '@/types/advancedModules.types';

export const purchaseLimitsService = {
  /**
   * Check purchase allowance for a product variant in current period
   */
  async checkAllowance(
    shopId: string,
    variantId: string,
    requestedQty: number = 1,
  ): Promise<PurchaseAllowance> {
    const { data, error } = await (supabase as any).rpc('check_purchase_allowance', {
      p_shop_id: shopId,
      p_variant_id: variantId,
      p_requested_qty: requestedQty,
    });

    if (error) {
      console.warn('[PurchaseLimitsService] error:', error);
      return { hasLimit: false, allowed: true, remaining: 999999 };
    }

    return {
      hasLimit: Boolean(data?.has_limit),
      allowed: Boolean(data?.allowed),
      limitQty: data?.limit_qty,
      purchasedQty: data?.purchased_qty,
      remaining: data?.remaining ?? 999999,
      period: data?.period,
    };
  },
};
