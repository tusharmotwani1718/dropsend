import { TrendingDown, TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CurrencySummary } from "@/lib/dashboard/constants";
import { formatMoney } from "@/lib/format";

/** Total spent, period-over-period change, average, and count — for one currency. */
export function TotalSpentCard({ summary }: { summary: CurrencySummary }) {
  const { currency, total, average, count, percentChange } = summary;

  return (
    <Card>
      <CardHeader>
        <CardDescription>Total spent · {currency}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">
          {formatMoney(total, currency)}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {percentChange === null ? (
          <p className="text-xs text-muted-foreground">No prior period to compare</p>
        ) : percentChange === 0 ? (
          <p className="text-xs text-muted-foreground">No change vs previous period</p>
        ) : (
          <div
            className={
              "flex items-center gap-1 text-xs font-medium " +
              (percentChange > 0 ? "text-destructive" : "text-primary")
            }
          >
            {percentChange > 0 ? (
              <TrendingUp className="size-3.5" />
            ) : (
              <TrendingDown className="size-3.5" />
            )}
            <span>
              {percentChange > 0 ? "+" : ""}
              {percentChange.toFixed(1)}% vs previous period
            </span>
          </div>
        )}
        <div className="flex items-center gap-4 border-t border-border pt-3 text-sm text-muted-foreground">
          <span>
            <span className="font-medium text-foreground tabular-nums">
              {formatMoney(average, currency)}
            </span>{" "}
            avg
          </span>
          <span>
            <span className="font-medium text-foreground tabular-nums">{count}</span>{" "}
            {count === 1 ? "receipt" : "receipts"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
