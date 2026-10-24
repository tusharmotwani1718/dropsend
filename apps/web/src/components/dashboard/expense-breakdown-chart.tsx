"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { UNKNOWN_CURRENCY } from "@/lib/dashboard/constants";
import type { BreakdownSlice } from "@/lib/dashboard/chart-utils";
import { formatMoney } from "@/lib/format";

/** Horizontal bar per category: bar length compares magnitude, and the
 * amount + percentage are rendered as a visible label at the end of each
 * bar (not hover-only) — mandatory, not optional, since two of the five
 * palette slots fall below 3:1 contrast on a light surface. */
export function ExpenseBreakdownChart({
  slices,
  currency,
}: {
  slices: BreakdownSlice[];
  currency: string;
}) {
  const displayCurrency = currency === UNKNOWN_CURRENCY ? null : currency;

  const config: ChartConfig = Object.fromEntries(
    slices.map((slice, index) => [
      slice.key,
      { label: slice.label, color: `var(--chart-${index + 1})` },
    ]),
  );

  const data = slices.map((slice) => ({
    key: slice.key,
    label: slice.label,
    total: slice.total,
    percentage: slice.percentage,
    labelText: `${formatMoney(slice.total, displayCurrency)} (${slice.percentage.toFixed(1)}%)`,
  }));

  return (
    <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 12, right: 72 }}
      >
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={110}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span>{item.payload.label}</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {formatMoney(Number(value), displayCurrency)} (
                    {item.payload.percentage.toFixed(1)}%)
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="total" radius={4}>
          {data.map((entry) => (
            <Cell key={entry.key} fill={`var(--color-${entry.key})`} />
          ))}
          <LabelList
            dataKey="labelText"
            position="right"
            className="fill-foreground text-xs tabular-nums"
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
