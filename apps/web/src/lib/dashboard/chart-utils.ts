import type { CategoryBreakdownRow } from "@/lib/dashboard/constants";
import { CATEGORY_LABELS } from "@/lib/receipts/labels";

// The app's validated categorical chart palette only has 5 distinct,
// CVD-safe hues (see globals.css) — cap slices at 5, folding the rest into
// one "Other categories" bucket rather than generating a 6th hue.
const MAX_SLICES = 5;
const OTHER_KEY = "rolled_up_other";

export type BreakdownSlice = {
  key: string;
  label: string;
  total: number;
  percentage: number;
};

/** Sorted, top-N-by-spend breakdown for one currency, with any remainder
 * folded into a single "Other categories" slice. */
export function toBreakdownSlices(rows: CategoryBreakdownRow[]): BreakdownSlice[] {
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const grandTotal = sorted.reduce((sum, row) => sum + row.total, 0);
  if (grandTotal <= 0) return [];

  const toSlice = (row: CategoryBreakdownRow): BreakdownSlice => ({
    key: row.category,
    label: CATEGORY_LABELS[row.category],
    total: row.total,
    percentage: (row.total / grandTotal) * 100,
  });

  if (sorted.length <= MAX_SLICES) {
    return sorted.map(toSlice);
  }

  const top = sorted.slice(0, MAX_SLICES - 1).map(toSlice);
  const restTotal = sorted
    .slice(MAX_SLICES - 1)
    .reduce((sum, row) => sum + row.total, 0);

  return [
    ...top,
    {
      key: OTHER_KEY,
      label: "Other categories",
      total: restTotal,
      percentage: (restTotal / grandTotal) * 100,
    },
  ];
}

/** Groups category-breakdown rows by currency, each sorted/rolled-up. */
export function groupBreakdownByCurrency(
  rows: CategoryBreakdownRow[],
): { currency: string; slices: BreakdownSlice[] }[] {
  const byCurrency = new Map<string, CategoryBreakdownRow[]>();
  for (const row of rows) {
    const existing = byCurrency.get(row.currency);
    if (existing) existing.push(row);
    else byCurrency.set(row.currency, [row]);
  }
  return [...byCurrency.entries()].map(([currency, currencyRows]) => ({
    currency,
    slices: toBreakdownSlices(currencyRows),
  }));
}
