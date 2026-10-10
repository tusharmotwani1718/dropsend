import type { ExpenseCategory } from "@/lib/receipts/constants";

export const DATE_PRESETS = [
  "today",
  "last_7_days",
  "last_30_days",
  "this_month",
  "custom",
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number];

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  last_7_days: "Last 7 Days",
  last_30_days: "Last 30 Days",
  this_month: "This Month",
  custom: "Custom Range",
};

/** Currency code the model couldn't read, kept separate rather than assumed. */
export const UNKNOWN_CURRENCY = "UNKNOWN";

export type SummaryRow = { currency: string; total: number; receipt_count: number };

export type CategoryBreakdownRow = {
  category: ExpenseCategory;
  currency: string;
  total: number;
};

export type TopExpenseRow = {
  receipt_id: string;
  merchant: string | null;
  expense_date: string | null;
  amount: number;
  currency: string;
  original_filename: string;
};

export type CurrencySummary = {
  currency: string;
  total: number;
  count: number;
  average: number;
  previousTotal: number;
  /** null when the previous period had no spend to compare against. */
  percentChange: number | null;
};

export type DashboardSummaryResponse = {
  range: { from: string; to: string; previousFrom: string; previousTo: string };
  totals: CurrencySummary[];
  categoryBreakdown: CategoryBreakdownRow[];
  topExpenses: TopExpenseRow[];
};
