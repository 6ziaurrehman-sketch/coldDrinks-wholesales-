import { supabase } from '@/lib/supabase';
import type { LoyaltySummary } from '@/types/advancedModules.types';

export const loyaltyService = {
  /**
   * Fetch loyalty points summary for the shop
   */
  async fetchSummary(shopId: string): Promise<LoyaltySummary> {
    const { data, error } = await (supabase as any).rpc('get_loyalty_summary', {
      p_shop_id: shopId,
    });

    if (error) {
      console.warn('[LoyaltyService] fetchSummary error:', error);
      return { totalPoints: 0, rupeeValue: 0, expiringPoints: 0 };
    }

    return {
      totalPoints: Number(data?.total_points || 0),
      rupeeValue: Number(data?.rupee_value || 0),
      expiringPoints: Number(data?.expiring_points || 0),
      nextExpiry: data?.next_expiry || null,
    };
  },

  /**
   * Calculate points earned from order amount
   * Rule: Rs. 10,000 -> 100 points (1 point per Rs. 100)
   */
  calculateEarnedPoints(paidAmount: number): number {
    if (paidAmount <= 0) return 0;
    return Math.floor(paidAmount / 100);
  },

  /**
   * Calculate max redeemable points for an order
   * Max 20% of order total can be paid using loyalty points
   */
  calculateMaxRedeemable(orderTotal: number, availablePoints: number): number {
    const maxRupeesAllowed = Math.floor(orderTotal * 0.2);
    return Math.min(availablePoints, maxRupeesAllowed);
  },
};
