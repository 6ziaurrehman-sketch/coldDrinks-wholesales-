import { supabase } from '@/lib/supabase';
import type { ScheduledOrder } from '@/types/advancedModules.types';

export const scheduledOrdersService = {
  /**
   * Calculate next run timestamp in Asia/Karachi (UTC+5)
   */
  calculateNextRun(
    ruleType: 'weekly' | 'monthly' | 'specific_date',
    ruleDay?: number | null,
    specificDate?: string,
    currentDateUtc: Date = new Date(),
  ): Date {
    // Current time in PKT
    const pktTime = new Date(currentDateUtc.getTime() + 5 * 3600 * 1000);

    if (ruleType === 'specific_date' && specificDate) {
      const parsed = new Date(specificDate);
      return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 1, 0, 0)); // 06:00 PKT is 01:00 UTC
    }

    if (ruleType === 'weekly' && ruleDay) {
      // ruleDay: 1 (Mon) to 7 (Sun)
      const currentPktDay = pktTime.getUTCDay() === 0 ? 7 : pktTime.getUTCDay();
      let daysUntil = ruleDay - currentPktDay;
      if (daysUntil <= 0) {
        daysUntil += 7;
      }
      const targetPkt = new Date(pktTime.getTime() + daysUntil * 24 * 3600 * 1000);
      return new Date(Date.UTC(targetPkt.getUTCFullYear(), targetPkt.getUTCMonth(), targetPkt.getUTCDate(), 1, 0, 0));
    }

    if (ruleType === 'monthly' && ruleDay) {
      // Clamp ruleDay to month length (e.g. 31st clamped to 28, 30, etc.)
      const year = pktTime.getUTCFullYear();
      let month = pktTime.getUTCMonth();
      const currentDay = pktTime.getUTCDate();

      // If already passed this month, move to next month
      if (currentDay >= ruleDay) {
        month += 1;
      }

      // Check days in target month
      const daysInTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const clampedDay = Math.min(ruleDay, daysInTargetMonth);

      return new Date(Date.UTC(year, month, clampedDay, 1, 0, 0));
    }

    // Default next day 06:00 PKT
    return new Date(currentDateUtc.getTime() + 24 * 3600 * 1000);
  },

  /**
   * Deterministic idempotency key for recurring order execution
   */
  generateRunKey(scheduleId: string, runDate: Date): string {
    const y = runDate.getUTCFullYear();
    const m = String(runDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(runDate.getUTCDate()).padStart(2, '0');
    return `sched_${scheduleId}_${y}${m}${d}`;
  },

  /**
   * Fetch scheduled orders for a shop
   */
  async fetchScheduledOrders(shopId: string): Promise<ScheduledOrder[]> {
    const { data, error } = await (supabase as any)
      .from('scheduled_orders')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[ScheduledOrdersService] fetch error:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      shopId: row.shop_id,
      addressId: row.address_id,
      paymentMethod: row.payment_method,
      ruleType: row.rule_type,
      ruleDay: row.rule_day,
      deliveryTimeSlot: row.delivery_time_slot,
      nextRunAt: row.next_run_at,
      status: row.status,
      templateId: row.template_id,
      items: row.items || [],
      createdBy: row.created_by,
      createdAt: row.created_at,
    }));
  },

  /**
   * Create new scheduled order
   */
  async createScheduledOrder(payload: {
    shopId: string;
    addressId?: string | null;
    paymentMethod: 'cash' | 'credit' | 'bank_transfer';
    ruleType: 'weekly' | 'monthly' | 'specific_date';
    ruleDay?: number | null;
    deliveryTimeSlot?: string;
    templateId?: string | null;
    items?: { variantId: string; quantity: number }[];
  }): Promise<string> {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) throw new Error('NOT_AUTHENTICATED');

    const nextRun = scheduledOrdersService.calculateNextRun(payload.ruleType, payload.ruleDay);

    const { data, error } = await (supabase as any)
      .from('scheduled_orders')
      .insert({
        shop_id: payload.shopId,
        address_id: payload.addressId || null,
        payment_method: payload.paymentMethod,
        rule_type: payload.ruleType,
        rule_day: payload.ruleDay || null,
        delivery_time_slot: payload.deliveryTimeSlot || 'morning',
        next_run_at: nextRun.toISOString(),
        template_id: payload.templateId || null,
        items: payload.items || [],
        created_by: user.user.id,
        status: 'active',
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to create scheduled order');
    }

    return data.id;
  },

  /**
   * Pause or resume scheduled order
   */
  async toggleStatus(scheduleId: string, newStatus: 'active' | 'paused' | 'cancelled'): Promise<void> {
    const { error } = await (supabase as any)
      .from('scheduled_orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', scheduleId);

    if (error) {
      throw new Error(error.message || 'Failed to update schedule status');
    }
  },
};
