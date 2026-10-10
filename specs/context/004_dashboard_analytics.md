## Overview
Replace the existing "Coming Soon" dashboard placeholder with a functional, minimal expense analytics dashboard using actual database data.

### Required Features

1. Total Money Spent
   - Calculate the total amount from eligible approved receipts within the selected date range.
   - Display totals separately by currency, with INR handled correctly.
   - Show the percentage change compared with the previous equivalent period.

2. Date Filters
   - Provide presets: Today, Last 7 Days, Last 30 Days, This Month, and Custom Range.
   - Apply the selected date range consistently to all dashboard metrics and charts.
   - Use the existing `created_at` field for date filtering and timeline calculations, with consistent timezone handling.

3. Expense Breakdown
   - Display spending grouped by expense category using a clean, minimal chart.
   - Show each category's total amount and percentage of overall spending.
   - Use existing database fields; do not invent categories or mock data.

4. Highest Expenses
   - Show the top 5 highest individual approved expenses within the selected date range.
   - Display merchant/receipt name, date, amount, and currency.
   - Allow users to navigate to the corresponding receipt details if existing routes support it.

5. Average Expense
   - Calculate average spending per approved receipt for the selected period.
   - Handle empty datasets and zero receipt counts safely.

### Backend and Performance Requirements
- Use actual database records and existing schema, services, and APIs wherever possible.
- Use database aggregation and indexed queries instead of fetching all receipts into application memory.
- Keep query processing efficient, avoid redundant database scans, and fetch independent aggregations in parallel when beneficial.
- Scope all queries to the authenticated user or authorized tenant.
- Never combine different currencies into a single total or label foreign-currency amounts as INR without valid conversion.
- Ensure every metric, chart, and list respects the selected date range and approved-status rules.
- Handle loading, empty, and error states properly.

### UI Requirements
- Build a clean, modern, responsive dashboard consistent with the existing application's design system.
- Keep the layout minimal, prioritizing the five features above without unnecessary sections.
- Use clear labels, readable charts, currency formatting, and consistent date formatting.
- Do not introduce mock data, unnecessary dependencies, or unrelated schema changes.

### Validation
Verify date filtering, approved receipt eligibility, currency separation, average calculations, top 5 ranking, comparison percentages, and empty-state behavior with appropriate tests.

First inspect the existing dashboard, database schema, APIs, and receipt status values. Then implement the smallest complete solution that fits the current architecture.