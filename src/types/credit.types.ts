export type LedgerEntryType = 'charge' | 'payment' | 'credit_note' | 'adjustment' | 'reversal';

export interface CreditSummary {
  shopId: string;
  limit: number;
  used: number;
  available: number;
  outstanding: number; // positive = debt, negative = account credit balance
  overdue: number;
  nextDue: string | null;
  termsDays: number;
  status: 'active' | 'suspended' | 'closed';
}

export interface CustomerLedgerEntry {
  id: string;
  shopId: string;
  entryType: LedgerEntryType;
  amount: number; // signed numeric
  refType: string;
  refId?: string | null;
  description?: string | null;
  createdAt: string;
  runningBalance?: number;
}

export interface CreditAlertItem {
  id: string;
  type: 'overdue' | 'due_tomorrow' | 'limit_reached' | 'high_outstanding';
  title: string;
  message: string;
  tone: 'error' | 'warning' | 'info';
  actionLabel?: string;
  actionRoute?: string;
}

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  ledgerEntryId: string;
  amount: number;
  createdAt: string;
}
