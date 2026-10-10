-- Read-only aggregation functions for the expense dashboard. All three scope
-- to the calling user via auth.uid() (not a parameter, so it can't be passed
-- incorrectly) and only ever consider `saved` (approved) receipts.
--
-- These run as the authenticated user (not service_role): the existing RLS
-- select policies on receipts/extractions already restrict rows to their
-- owner, so no bypass is needed for reads, only for the writes elsewhere in
-- this schema.

-- Per-currency total spent and receipt count in [p_start, p_end). Currency is
-- never merged or assumed: a receipt whose currency the model couldn't read
-- is grouped under 'UNKNOWN', never folded into INR or any other code.
create function public.get_expense_summary(p_start timestamptz, p_end timestamptz)
returns table (currency text, total numeric, receipt_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(e.currency, 'UNKNOWN') as currency,
    sum(e.amount) as total,
    count(*) as receipt_count
  from public.extractions e
  join public.receipts r on r.id = e.receipt_id
  where r.user_id = (select auth.uid())
    and r.status = 'saved'
    and r.created_at >= p_start
    and r.created_at < p_end
    and e.amount is not null
  group by coalesce(e.currency, 'UNKNOWN');
$$;

-- Spend per category, split by currency for the same reason as above.
create function public.get_expense_category_breakdown(p_start timestamptz, p_end timestamptz)
returns table (category public.expense_category, currency text, total numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(e.category, 'other'::public.expense_category) as category,
    coalesce(e.currency, 'UNKNOWN') as currency,
    sum(e.amount) as total
  from public.extractions e
  join public.receipts r on r.id = e.receipt_id
  where r.user_id = (select auth.uid())
    and r.status = 'saved'
    and r.created_at >= p_start
    and r.created_at < p_end
    and e.amount is not null
  group by coalesce(e.category, 'other'::public.expense_category), coalesce(e.currency, 'UNKNOWN')
  order by total desc;
$$;

-- The p_limit highest individual expenses in [p_start, p_end), across
-- currencies (each row carries its own currency for display).
create function public.get_top_expenses(p_start timestamptz, p_end timestamptz, p_limit integer default 5)
returns table (
  receipt_id uuid,
  merchant text,
  expense_date date,
  amount numeric,
  currency text,
  original_filename text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.id as receipt_id,
    e.merchant,
    e.date as expense_date,
    e.amount,
    coalesce(e.currency, 'UNKNOWN') as currency,
    r.original_filename
  from public.extractions e
  join public.receipts r on r.id = e.receipt_id
  where r.user_id = (select auth.uid())
    and r.status = 'saved'
    and r.created_at >= p_start
    and r.created_at < p_end
    and e.amount is not null
  order by e.amount desc
  limit greatest(p_limit, 0);
$$;

revoke execute on function public.get_expense_summary(timestamptz, timestamptz)
  from public, anon;
grant execute on function public.get_expense_summary(timestamptz, timestamptz)
  to authenticated;

revoke execute on function public.get_expense_category_breakdown(timestamptz, timestamptz)
  from public, anon;
grant execute on function public.get_expense_category_breakdown(timestamptz, timestamptz)
  to authenticated;

revoke execute on function public.get_top_expenses(timestamptz, timestamptz, integer)
  from public, anon;
grant execute on function public.get_top_expenses(timestamptz, timestamptz, integer)
  to authenticated;
