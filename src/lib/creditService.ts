import { supabase } from '@/lib/supabase';
import type {
  CreditAlertItem,
  CreditSummary,
  CustomerLedgerEntry,
} from '@/types/credit.types';

export const creditService = {
  fetchCreditSummary: async (shopId: string): Promise<CreditSummary> => {
    const { data, error } = await (supabase.rpc as any)('get_credit_summary', {
      p_shop_id: shopId,
    });

    if (error) {
      throw new Error(error.message);
    }

    const d = data as any;
    return {
      shopId: d.shop_id,
      limit: Number(d.limit || 0),
      used: Number(d.used || 0),
      available: Number(d.available || 0),
      outstanding: Number(d.outstanding || 0),
      overdue: Number(d.overdue || 0),
      nextDue: d.next_due,
      termsDays: Number(d.terms_days || 14),
      status: d.status || 'active',
    };
  },

  fetchLedger: async (
    shopId: string,
    filterType: string = 'all',
    limit: number = 50,
    cursor?: string | null,
  ): Promise<CustomerLedgerEntry[]> => {
    const { data, error } = await (supabase.rpc as any)('list_customer_ledger', {
      p_shop_id: shopId,
      p_filter_type: filterType,
      p_limit: limit,
      p_cursor_created_at: cursor || null,
    });

    if (error) {
      throw new Error(error.message);
    }

    return ((data as any[]) || []).map((entry: any) => ({
      id: entry.id,
      shopId: entry.shop_id,
      entryType: entry.entry_type,
      amount: Number(entry.amount || 0),
      refType: entry.ref_type,
      refId: entry.ref_id,
      description: entry.description,
      createdAt: entry.created_at,
    }));
  },

  /**
   * Computes running balances for a list of chronological or reverse-chronological ledger entries.
   */
  computeRunningBalances: (
    entries: CustomerLedgerEntry[],
    latestOutstanding: number,
  ): CustomerLedgerEntry[] => {
    let current = latestOutstanding;
    // Entries come sorted newest first
    return entries.map((entry) => {
      const balanceForThisEntry = current;
      // Undo this entry's impact to calculate previous balance
      current = current - entry.amount;
      return {
        ...entry,
        runningBalance: balanceForThisEntry,
      };
    });
  },

  /**
   * Computes actionable alerts for credit status:
   * - Overdue notice
   * - Due tomorrow alert in Asia/Karachi timezone
   * - Credit limit reached
   * - High outstanding balance
   */
  computeAlerts: (summary: CreditSummary): CreditAlertItem[] => {
    const alerts: CreditAlertItem[] = [];

    // 1. Overdue Alert
    if (summary.overdue > 0) {
      alerts.push({
        id: 'alert-overdue',
        type: 'overdue',
        title: 'Payment Overdue',
        message: `Your account has Rs. ${summary.overdue.toLocaleString()} in overdue invoices. Please settle immediately to avoid delivery holds.`,
        tone: 'error',
        actionLabel: 'Upload Payment Proof',
        actionRoute: '/payments/upload-proof',
      });
    }

    // 2. Due Tomorrow Alert
    if (summary.nextDue) {
      const dueDate = new Date(summary.nextDue);
      const now = new Date();
      const diffMs = dueDate.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours > 0 && diffHours <= 36) {
        alerts.push({
          id: 'alert-due-tomorrow',
          type: 'due_tomorrow',
          title: 'Payment Due Tomorrow',
          message: `An invoice payment is due by tomorrow (${dueDate.toLocaleDateString()}). Settle now to maintain your credit terms.`,
          tone: 'warning',
          actionLabel: 'Pay Now',
          actionRoute: '/payments/upload-proof',
        });
      }
    }

    // 3. Limit Reached Alert
    if (summary.limit > 0 && summary.used >= summary.limit) {
      alerts.push({
        id: 'alert-limit-reached',
        type: 'limit_reached',
        title: 'Credit Limit Reached',
        message: 'Your credit limit has been fully utilized. Make a payment to restore your available credit balance.',
        tone: 'warning',
        actionLabel: 'Make Payment',
        actionRoute: '/payments/upload-proof',
      });
    }

    // 4. High Outstanding Alert
    if (
      summary.outstanding > 0 &&
      summary.limit > 0 &&
      summary.outstanding >= 0.8 * summary.limit &&
      summary.used < summary.limit
    ) {
      alerts.push({
        id: 'alert-high-outstanding',
        type: 'high_outstanding',
        title: 'Outstanding Balance Notice',
        message: `Your account has Rs. ${summary.outstanding.toLocaleString()} outstanding (80% of limit used).`,
        tone: 'info',
        actionLabel: 'View Details',
      });
    }

    return alerts;
  },
};
