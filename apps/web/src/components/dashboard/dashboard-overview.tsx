"use client";

import { useState } from "react";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { ExpenseBreakdownChart } from "@/components/dashboard/expense-breakdown-chart";
import { TopExpensesList } from "@/components/dashboard/top-expenses-list";
import { TotalSpentCard } from "@/components/dashboard/total-spent-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardSummary } from "@/hooks/use-dashboard-summary";
import { groupBreakdownByCurrency } from "@/lib/dashboard/chart-utils";
import type { DatePreset } from "@/lib/dashboard/constants";
import { formatDate } from "@/lib/format";

export function DashboardOverview() {
  const [preset, setPreset] = useState<DatePreset>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { data, loading, error } = useDashboardSummary(
    preset,
    preset === "custom" ? { from: customFrom, to: customTo } : undefined,
  );

  const awaitingCustomRange = preset === "custom" && (!customFrom || !customTo);
  const breakdownByCurrency = data ? groupBreakdownByCurrency(data.categoryBreakdown) : [];

  return (
    <div className="flex flex-col gap-6">
      <DateRangeFilter
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      {data && (
        <p className="text-sm text-muted-foreground">
          {formatDate(data.range.from)} – {formatDate(data.range.to)}, compared with{" "}
          {formatDate(data.range.previousFrom)} – {formatDate(data.range.previousTo)}
        </p>
      )}

      {awaitingCustomRange ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Pick a start and end date to see this range.
        </p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : loading ? (
        <DashboardSkeleton />
      ) : !data || data.totals.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          No approved expenses in this period yet.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.totals.map((summary) => (
              <TotalSpentCard key={summary.currency} summary={summary} />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              {breakdownByCurrency.map(({ currency, slices }) => (
                <div
                  key={currency}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <h3 className="mb-3 text-sm font-medium text-foreground">
                    Spending by category · {currency}
                  </h3>
                  {slices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data.</p>
                  ) : (
                    <ExpenseBreakdownChart slices={slices} currency={currency} />
                  )}
                </div>
              ))}
            </div>

            <TopExpensesList expenses={data.topExpenses} />
          </div>
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  );
}
