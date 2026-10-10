# Dashboard Analytics

Replaces the "Coming soon" dashboard with expense analytics over `saved` (approved) receipts: total spent, period-over-period change, category breakdown, highest expenses, and average spend — all scoped to a selected date range. Implements issue #18.

## Decisions

- **"Approved" = `status = 'saved'`.** The only finalized state in the `receipt_status` enum; `needs_review`/`uploading`/`processing`/`failed` never count toward any dashboard figure.
- **Date filtering uses `receipts.created_at`** (upload time), not `extractions.date` (the receipt's purchase date) — matches the context spec's explicit instruction, and reuses the existing `receipts_user_id_created_at_idx (user_id, created_at desc)` index, so no new index was needed.
- **All date math is UTC**, computed server-side from the server's clock — matches how dates are already displayed elsewhere (`lib/format.ts`'s `formatDate` uses `timeZone: "UTC"`). Presets ("Today", "This Month", etc.) are resolved on the server, not the client, so there's one source of truth and no client/server clock skew.
- **"Previous equivalent period"** = the immediately preceding window of the same length (e.g. "Last 7 Days" compares against the 7 days before that; "This Month" so far compares against the same number of trailing days in the previous month). Returned by the API so the UI never recomputes it.
- **Currency is never merged.** Every total, average, and breakdown is grouped by currency; a receipt whose currency the model couldn't read is grouped under `UNKNOWN`, never assumed to be INR.
- **Aggregation happens in Postgres**, not application memory: three new `SECURITY INVOKER` SQL functions, each scoped via `auth.uid()` directly (not a passed parameter, so it can't be spoofed) and run through RLS like any other read — no service-role bypass needed since users can already read their own `receipts`/`extractions`. All three (plus the previous-period comparison call) run in parallel via `Promise.all`.
- **No new chart library existed** in this codebase; added Recharts via `shadcn add chart` (the official shadcn wrapper, reads the app's `--chart-1..5` CSS variables) rather than hand-rolling SVG.
- **Accessibility fix to the existing theme:** `--chart-1..5` in `globals.css` were a single-hue ramp (Tailwind's emerald scale at different shades) — run through the dataviz skill's palette validator, this hard-fails as a categorical (multi-series) palette (CVD separation and normal-vision floor both fail). Replaced with the skill's validated categorical order (blue/orange/aqua/yellow/magenta), re-validated clean in both light and dark. Nothing else in the theme changed.
- **Category breakdown caps at 5 slices** (matching the 5 validated colors): categories beyond the top 4 by spend fold into one "Other categories" bucket, done client-side after the SQL grouping.
- **Highest Expenses links to `/receipts`** (the existing list page), not a per-receipt detail route — none exists, and the spec's own wording ("if existing routes support it") anticipated this.
- **No Realtime subscription on the dashboard.** Unlike the receipts list, this page doesn't live-update if data changes in another tab — refetches on filter change only, keeping scope to what the issue asked for.

## Database

Migration: `supabase/migrations/20261009130000_dashboard_analytics.sql`.

| Function | Returns | Purpose |
| --- | --- | --- |
| `get_expense_summary(p_start, p_end)` | `(currency, total, receipt_count)` rows | Per-currency total + count in range. Called twice per request (selected range and previous range) to derive % change and average. |
| `get_expense_category_breakdown(p_start, p_end)` | `(category, currency, total)` rows | Spend per category, split by currency, sorted descending. |
| `get_top_expenses(p_start, p_end, p_limit)` | `(receipt_id, merchant, expense_date, amount, currency, original_filename)` rows | The `p_limit` (default 5) highest individual expenses, ranked by amount across currencies. |

All three: `language sql`, `security invoker`, `set search_path = ''`, filter `r.status = 'saved' and r.user_id = (select auth.uid())`, granted to `authenticated` only (revoked from `public`/`anon`).

Verified directly against seeded test data (via `psql`, simulating `auth.uid()` through `request.jwt.claims`, since this branch had no UI path to `saved` status before `feat/review-receipt-before-saving` merged): approved-only filtering, currency separation, date-boundary inclusivity/exclusivity, category grouping, top-5 ranking, empty-range behavior, and per-user RLS isolation all confirmed correct against real rows, then cleaned up.

## API

### `GET /api/dashboard/summary?preset=...&from=...&to=...`

| Step | Behavior |
| --- | --- |
| Auth | 401 if no session. |
| Validation | `preset` must be one of `today`/`last_7_days`/`last_30_days`/`this_month`/`custom`; `custom` requires valid `from`/`to` with `from <= to`. 400 on failure. |
| Range resolution | `lib/dashboard/range.ts`'s `resolveDateRange()` (server-only) turns the preset into UTC day boundaries plus the previous-period boundaries. |
| Fetch | The 4 RPC calls (current summary, previous summary, breakdown, top 5) run via `Promise.all` through the RLS-scoped client — no admin client involved, these are reads. |
| Response | `{ range, totals[], categoryBreakdown[], topExpenses[] }`. `totals[]` includes `percentChange` (`null` when the previous period had no spend to compare against — never a divide-by-zero `Infinity`). |

## Frontend

- `app/(protected)/dashboard/page.tsx` stays a Server Component (keeps its `metadata` export); renders `<DashboardOverview />`, a Client Component, matching the existing `receipts/page.tsx` → `<ReceiptsTable />` split.
- `useDashboardSummary(preset, custom?)` (`hooks/use-dashboard-summary.ts`): fetches on mount and on preset/range change; when `preset === "custom"` and dates aren't both picked yet, skips the fetch and clears loading rather than spinning forever.
- `components/dashboard/`: `date-range-filter.tsx` (preset buttons + two native `<input type="date">` for custom — no new date-picker component), `total-spent-card.tsx` (total, % change badge with icon + label — never color alone, average, count), `expense-breakdown-chart.tsx` (horizontal bar, one per category, Recharts + shadcn `ChartContainer`), `top-expenses-list.tsx`, `dashboard-overview.tsx` (wires it all together with loading/empty/error states).

## Dependencies Added

- `recharts` (via `shadcn add chart`, which also wrote `components/ui/chart.tsx`)

## Not Included / Future Work

- Per-field confidence/duplicate detection — unrelated to this issue, unchanged from `004_OCR-gemma.md`.
- Live updates if `saved` status changes in another tab (no Realtime subscription here).
- A cap on custom date-range span (not required; query cost is bound by matching rows, not calendar span, for a single user).
- A dedicated per-receipt detail route for Highest Expenses to deep-link to (links to `/receipts` instead).
