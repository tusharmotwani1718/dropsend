-- Duplicate detection: flags a new receipt as a probable duplicate of one the
-- user already has, so they can discard it or keep it anyway.
--
-- Two checks, both run inside the worker's database calls:
-- 1. Same image (sha256 `image_hash`), right after the upload is verified.
--    OCR is skipped for these; it runs only if the user keeps the receipt.
-- 2. Same extracted data (merchant, amount, date and line items), when the
--    OCR result is saved.
--
-- A flagged receipt gets status `duplicate` and `duplicate_of` points at the
-- matching receipt. Keeping it sets `duplicate_dismissed` so it's never
-- flagged again (e.g. when it's retried).

-- Not used by any statement in this migration: a new enum value can't be
-- used in the transaction that adds it (function bodies are only checked
-- when they run).
alter type public.receipt_status add value if not exists 'duplicate' after 'saved';

alter table public.receipts
  add column duplicate_of uuid references public.receipts (id) on delete set null,
  add column duplicate_dismissed boolean not null default false;

create index receipts_user_id_image_hash_idx
  on public.receipts (user_id, image_hash)
  where image_hash is not null;

-- Merchant names compared case- and whitespace-insensitively.
create function public.merchant_key(p_merchant text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(regexp_replace(btrim(p_merchant), '\s+', ' ', 'g')), '');
$$;

-- Records a verified upload's image hash and moves it from `uploading` to
-- `processing`, or to `duplicate` if the user already has a receipt with the
-- same image that was uploaded successfully (`processing`, `needs_review` or
-- `saved`). Returns the new status, or null if the receipt was deleted or is
-- no longer `uploading`.
create function public.mark_receipt_verified(
  p_receipt_id uuid,
  p_image_hash text
)
returns public.receipt_status
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_dismissed boolean;
  v_duplicate_of uuid;
  v_status public.receipt_status;
begin
  select user_id, duplicate_dismissed into v_user_id, v_dismissed
  from public.receipts
  where id = p_receipt_id and status = 'uploading'
  for update;

  if v_user_id is null then
    return null;
  end if;

  -- One duplicate check at a time per user, so two copies processed at
  -- the same time can't both miss each other.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  if not v_dismissed then
    select r.id into v_duplicate_of
    from public.receipts r
    where r.user_id = v_user_id
      and r.id <> p_receipt_id
      and r.image_hash = p_image_hash
      and r.status in ('processing', 'needs_review', 'saved')
    order by r.created_at
    limit 1;
  end if;

  update public.receipts
  set
    image_hash = p_image_hash,
    error = null,
    status = case
      when v_duplicate_of is null then 'processing'
      else 'duplicate'
    end::public.receipt_status,
    duplicate_of = v_duplicate_of
  where id = p_receipt_id
  returning status into v_status;

  return v_status;
end;
$$;

-- Same as before (see *_create_extractions.sql), plus the extracted-data
-- duplicate check: the receipt moves to `duplicate` instead of
-- `needs_review` when another `needs_review` or `saved` receipt of the user
-- has the same merchant, amount, currency, date and line item totals.
-- Merchant, amount and date must all be known to match; a missing currency
-- on either side matches any currency. Item names aren't compared (they're
-- the noisiest part of OCR output), only the set of line totals.
create or replace function public.save_receipt_extraction(
  p_receipt_id uuid,
  p_model text,
  p_raw_output jsonb,
  p_extraction jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_dismissed boolean;
  v_extraction public.extractions;
  v_duplicate_of uuid;
begin
  select user_id, duplicate_dismissed into v_user_id, v_dismissed
  from public.receipts
  where id = p_receipt_id and status = 'processing'
  for update;

  if v_user_id is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  delete from public.extractions where receipt_id = p_receipt_id;

  insert into public.extractions (
    receipt_id, user_id, merchant, amount, currency, date,
    category, payment_method, model, raw_output
  )
  values (
    p_receipt_id,
    v_user_id,
    p_extraction ->> 'merchant',
    (p_extraction ->> 'amount')::numeric,
    p_extraction ->> 'currency',
    (p_extraction ->> 'date')::date,
    (p_extraction ->> 'category')::public.expense_category,
    (p_extraction ->> 'payment_method')::public.payment_method,
    p_model,
    p_raw_output
  )
  returning * into v_extraction;

  insert into public.extraction_items (
    extraction_id, user_id, position, name, quantity, unit_price, total
  )
  select
    v_extraction.id,
    v_user_id,
    item.position,
    item.value ->> 'name',
    (item.value ->> 'quantity')::numeric,
    (item.value ->> 'unit_price')::numeric,
    (item.value ->> 'total')::numeric
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    with ordinality as item(value, position);

  if not v_dismissed
    and public.merchant_key(v_extraction.merchant) is not null
    and v_extraction.amount is not null
    and v_extraction.date is not null
  then
    select r.id into v_duplicate_of
    from public.extractions e
    join public.receipts r on r.id = e.receipt_id
    where e.user_id = v_user_id
      and e.receipt_id <> p_receipt_id
      and r.status in ('needs_review', 'saved')
      and e.date = v_extraction.date
      and e.amount = v_extraction.amount
      and (
        e.currency is null
        or v_extraction.currency is null
        or e.currency = v_extraction.currency
      )
      and public.merchant_key(e.merchant) = public.merchant_key(v_extraction.merchant)
      -- Same line totals, in any order (null totals compare equal).
      and array(
        select i.total from public.extraction_items i
        where i.extraction_id = e.id
        order by i.total nulls last
      ) = array(
        select i.total from public.extraction_items i
        where i.extraction_id = v_extraction.id
        order by i.total nulls last
      )
    order by r.created_at
    limit 1;
  end if;

  update public.receipts
  set
    status = case
      when v_duplicate_of is null then 'needs_review'
      else 'duplicate'
    end::public.receipt_status,
    duplicate_of = v_duplicate_of,
    error = null
  where id = p_receipt_id;

  return v_extraction.id;
end;
$$;

-- "Keep anyway": moves a `duplicate` receipt on and stops it being flagged
-- again. Receipts flagged by the extracted-data check already have an
-- extraction and go to `needs_review`; ones flagged by the image check were
-- never OCR'd and go to `processing` (the caller queues the OCR).
-- `duplicate_of` is kept as a record of the match. Returns the new status,
-- or null if the receipt doesn't exist or isn't `duplicate`.
create function public.keep_duplicate_receipt(p_receipt_id uuid)
returns public.receipt_status
language plpgsql
set search_path = ''
as $$
declare
  v_status public.receipt_status;
begin
  update public.receipts r
  set
    status = case
      when exists (select 1 from public.extractions e where e.receipt_id = r.id)
        then 'needs_review'
      else 'processing'
    end::public.receipt_status,
    duplicate_dismissed = true
  where r.id = p_receipt_id and r.status = 'duplicate'
  returning r.status into v_status;

  return v_status;
end;
$$;

-- Only the service role (the worker and API routes) may call them.
revoke execute on function public.mark_receipt_verified(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_receipt_verified(uuid, text)
  to service_role;

revoke execute on function public.keep_duplicate_receipt(uuid)
  from public, anon, authenticated;
grant execute on function public.keep_duplicate_receipt(uuid)
  to service_role;
