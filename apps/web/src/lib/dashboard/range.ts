import "server-only";
import type { DatePreset } from "@/lib/dashboard/constants";

export type ResolvedRange = {
  /** Calendar date, inclusive, YYYY-MM-DD (UTC). */
  from: string;
  to: string;
  /** Query boundaries: start inclusive, end exclusive. */
  start: string;
  end: string;
  /** The immediately preceding period of the same length, for % change. */
  previousFrom: string;
  previousTo: string;
  previousStart: string;
  previousEnd: string;
};

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Resolves a preset (or an explicit custom range) into UTC calendar-day
 * boundaries, plus the immediately preceding period of the same length for
 * the percent-change comparison. All "today"/"this month" math uses the
 * server's clock in UTC, matching how dates are already displayed elsewhere
 * in this app (`lib/format.ts`'s `formatDate`) — a single, consistent
 * timezone rather than the caller's.
 */
export function resolveDateRange(
  preset: DatePreset,
  custom?: { from: string; to: string },
): ResolvedRange {
  const now = new Date();
  const today = toDateOnly(now);

  let from: string;
  let to: string;

  switch (preset) {
    case "today":
      from = today;
      to = today;
      break;
    case "last_7_days":
      from = toDateOnly(addUtcDays(startOfUtcDay(today), -6));
      to = today;
      break;
    case "last_30_days":
      from = toDateOnly(addUtcDays(startOfUtcDay(today), -29));
      to = today;
      break;
    case "this_month":
      from = toDateOnly(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
      to = today;
      break;
    case "custom": {
      if (!custom) throw new Error("Custom range requires from/to");
      from = custom.from;
      to = custom.to;
      break;
    }
  }

  if (from > to) {
    throw new Error("from must not be after to");
  }

  const start = startOfUtcDay(from);
  // Exclusive upper bound: the day after `to`, so the whole `to` day is included.
  const end = addUtcDays(startOfUtcDay(to), 1);
  const durationDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);

  const previousEnd = start;
  const previousStart = addUtcDays(start, -durationDays);

  return {
    from,
    to,
    start: start.toISOString(),
    end: end.toISOString(),
    previousFrom: toDateOnly(previousStart),
    previousTo: toDateOnly(addUtcDays(previousEnd, -1)),
    previousStart: previousStart.toISOString(),
    previousEnd: previousEnd.toISOString(),
  };
}
