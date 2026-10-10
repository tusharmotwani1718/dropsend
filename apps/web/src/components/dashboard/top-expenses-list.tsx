import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UNKNOWN_CURRENCY, type TopExpenseRow } from "@/lib/dashboard/constants";
import { formatDate, formatMoney } from "@/lib/format";

/** The 5 highest individual expenses in the selected range. */
export function TopExpensesList({ expenses }: { expenses: TopExpenseRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Highest expenses</CardTitle>
        <CardDescription>Top {expenses.length || 5} in the selected period</CardDescription>
      </CardHeader>
      <CardContent>
        {expenses.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No approved expenses in this period.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {expenses.map((expense) => (
              <li key={expense.receipt_id}>
                <Link
                  href="/receipts"
                  className="flex items-center justify-between gap-4 py-3 text-sm transition-colors hover:text-primary"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-foreground">
                      {expense.merchant ?? expense.original_filename}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {expense.expense_date ? formatDate(expense.expense_date) : "No date"}
                    </span>
                  </div>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="font-medium tabular-nums text-foreground">
                      {formatMoney(
                        expense.amount,
                        expense.currency === UNKNOWN_CURRENCY ? null : expense.currency,
                      )}
                    </span>
                    {expense.currency === UNKNOWN_CURRENCY && (
                      <span className="text-xs text-muted-foreground">
                        Unknown currency
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
