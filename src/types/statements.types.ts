export type StatementPreset = 'this_month' | 'last_month' | 'last_90_days' | 'custom';

export interface StatementMovement {
  id: string;
  date: string;
  type: 'charge' | 'payment' | 'credit_note' | 'adjustment' | 'reversal';
  refType: string;
  refId: string;
  description: string;
  amount: number; // Signed: positive = charge, negative = payment / credit_note
  runningBalance: number;
}

export interface StatementSummary {
  shopId: string;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  closingBalance: number;
  totalCharges: number;
  totalPayments: number;
  totalCreditNotes: number;
  generatedAt: string;
}

export interface StatementResult {
  summary: StatementSummary;
  lines: StatementMovement[];
}
