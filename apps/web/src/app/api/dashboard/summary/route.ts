import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-user";
import type {
  CategoryBreakdownRow,
  CurrencySummary,
  DashboardSummaryResponse,
  SummaryRow,
  TopExpenseRow,
} from "@/lib/dashboard/constants";
import { resolveDateRange } from "@/lib/dashboard/range";
import { dashboardQuerySchema } from "@/lib/dashboard/schemas";

const TOP_EXPENSES_LIMIT = 5;

/**
 * Expense dashboard summary for the selected date range: per-currency
 * totals (with the previous equivalent period for % change), category
 * breakdown, and the top expenses. Scoped to the signed-in user via RLS +
 * auth.uid() inside the RPCs — no service role needed, these are reads.
 */
export async function GET(request: NextRequest) {
  const { supabase, userId } = await getSessionUser();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = dashboardQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const { preset, from, to } = parsed.data;
  let range;
  try {
    range = resolveDateRange(
      preset,
      preset === "custom" ? { from: from!, to: to! } : undefined,
    );
  } catch {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const [summary, previousSummary, breakdown, top] = await Promise.all([
    supabase.rpc("get_expense_summary", { p_start: range.start, p_end: range.end }),
    supabase.rpc("get_expense_summary", {
      p_start: range.previousStart,
      p_end: range.previousEnd,
    }),
    supabase.rpc("get_expense_category_breakdown", {
      p_start: range.start,
      p_end: range.end,
    }),
    supabase.rpc("get_top_expenses", {
      p_start: range.start,
      p_end: range.end,
      p_limit: TOP_EXPENSES_LIMIT,
    }),
  ]) as [
    { data: SummaryRow[] | null; error: { message: string } | null },
    { data: SummaryRow[] | null; error: { message: string } | null },
    { data: CategoryBreakdownRow[] | null; error: { message: string } | null },
    { data: TopExpenseRow[] | null; error: { message: string } | null },
  ];

  for (const result of [summary, previousSummary, breakdown, top]) {
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }
  }

  const previousByCurrency = new Map(
    (previousSummary.data ?? []).map((row) => [row.currency, row]),
  );

  const totals: CurrencySummary[] = (summary.data ?? []).map((row) => {
    const previousTotal = previousByCurrency.get(row.currency)?.total ?? 0;
    const percentChange =
      previousTotal > 0 ? ((row.total - previousTotal) / previousTotal) * 100 : null;

    return {
      currency: row.currency,
      total: row.total,
      count: row.receipt_count,
      average: row.receipt_count > 0 ? row.total / row.receipt_count : 0,
      previousTotal,
      percentChange,
    };
  });

  const response: DashboardSummaryResponse = {
    range: {
      from: range.from,
      to: range.to,
      previousFrom: range.previousFrom,
      previousTo: range.previousTo,
    },
    totals,
    categoryBreakdown: breakdown.data ?? [],
    topExpenses: top.data ?? [],
  };

  return NextResponse.json(response);
}
