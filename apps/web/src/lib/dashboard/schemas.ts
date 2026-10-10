import { z } from "zod";
import { DATE_PRESETS } from "@/lib/dashboard/constants";

// Same round-trip check as `editableDate` in receipts/schemas.ts: the regex
// alone accepts impossible dates like 2026-02-30, which `Date` then silently
// rolls forward into March.
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Invalid date" })
  .refine(
    (value) => {
      const parsed = new Date(`${value}T00:00:00Z`);
      return (
        !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
      );
    },
    { error: "Invalid date" },
  );

export const dashboardQuerySchema = z
  .object({
    preset: z.enum(DATE_PRESETS, { error: "Invalid date preset" }),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
  })
  .refine(
    (data) =>
      data.preset !== "custom" || (!!data.from && !!data.to && data.from <= data.to),
    { error: "Custom range requires a valid from and to date", path: ["to"] },
  );

export type DashboardQuery = z.output<typeof dashboardQuerySchema>;
