# Duplicate Receipt Detection

Flags a newly uploaded receipt as a **probable duplicate** of one the user already has, so the user can **Discard** it or **Keep anyway**. Context: `specs/context/005_Duplicate_Receipt_Detection.md`.

## Decisions

- **Two checks, both in the database:**
  1. **Same image**: the sha256 `image_hash` already computed when an upload is verified matches another receipt of the user. Runs before OCR, so the duplicate is **not** sent to Gemini (saves quota); OCR runs only if the user keeps it.
  2. **Same extracted data**: when the OCR result is saved, another receipt of the user has the same merchant, amount, currency, date and line items. Catches the same bill photographed twice, or a photo plus a screenshot.
- **Matching is forgiving, because OCR output is noisy:**
  - Merchant: case- and whitespace-insensitive (`merchant_key()`).
  - Amount: equal to the cent.
  - Date: exact.
  - Currency: equal, or missing on either side (the model sometimes can't read it).
  - Items: the same set of line totals, in any order. Item names are **not** compared; they are the noisiest field. Two receipts with no items match on the other fields alone.
  - Merchant, amount and date must all be present. Two receipts that are both missing a date never match.
- **Only successful receipts count as a match:**
  - Data check: `needs_review` and `saved` receipts, which includes duplicates the user kept.
  - Image check: also `processing` receipts, so the same file twice in one batch is caught without a second OCR call.
  - Never `failed` receipts, receipts still uploading, or other unresolved duplicates.
  - When several receipts match, the oldest one wins.
- **New status, not just a flag.** A flagged receipt gets status `duplicate`, and `duplicate_of` points at the receipt it matches. It can't be reviewed or saved until the user resolves it, so duplicates don't reach the expense data by accident.
- **"Keep anyway", not "Upload anyway".** By the time a receipt is flagged it's already uploaded (and, for the data check, already OCR'd), so the choice is to keep it or not. Keeping sets `duplicate_dismissed`, so the receipt is never flagged again (e.g. when a later OCR run fails and it's retried). `duplicate_of` stays set as a record of the match.
- **Discard is a normal delete** (`DELETE /api/receipts/[id]`): the receipt, its image and any extraction are removed. There's no confirmation dialog, since the original is still there.
- **Race-safe:** both checks take a per-user transaction-level advisory lock (`pg_advisory_xact_lock`), so two copies processed at the same moment can't both miss each other. Lock order: receipt row first, then the advisory lock, in every function.

## Database

Migration: `supabase/migrations/20261010120000_detect_duplicate_receipts.sql`. Apply it with `supabase db push`.

- `receipt_status` gains `duplicate` (after `saved`).
- `receipts` gains:

| Column | Type | Notes |
| --- | --- | --- |
| `duplicate_of` | `uuid` | FK → `receipts.id`, `on delete set null`. The receipt this one matches. Set while `duplicate`; kept after "Keep anyway". |
| `duplicate_dismissed` | `boolean not null default false` | True once the user kept a flagged duplicate; skips both checks from then on. |

- Index `receipts_user_id_image_hash_idx` on `(user_id, image_hash)` for the image check. The data check uses the existing `extractions_user_id_date_idx`.

### Functions

All are `service_role` only (execute revoked from `public`, `anon`, `authenticated`).

| Function | Behavior |
| --- | --- |
| `merchant_key(text) → text` | Lower-case, trimmed, whitespace-collapsed merchant; null if blank. Immutable helper. |
| `mark_receipt_verified(p_receipt_id, p_image_hash) → receipt_status` | Locks the `uploading` receipt, stores the hash, moves it to `processing`, or to `duplicate` with `duplicate_of` on an image match. Returns the new status, or null if the receipt was deleted or isn't `uploading`. Replaces the plain update `verifyReceipt` did before. |
| `save_receipt_extraction(...)` | Replaced (same signature and grants). As before, plus the data check after inserting the extraction and items: moves the receipt to `duplicate` instead of `needs_review` on a match. |
| `keep_duplicate_receipt(p_receipt_id) → receipt_status` | `duplicate` → `needs_review` if it has an extraction, else `processing` (the caller queues OCR). Sets `duplicate_dismissed`. Returns the new status, or null if it isn't `duplicate`. |

## Background Processing (Inngest)

There are no new steps. In `verifyReceipt` (`lib/receipts/process.ts`), `mark_receipt_verified` now does the final status update, and the function returns true (continue to OCR) only for `processing`. An image duplicate ends the run there. The data check happens inside the existing `save-extraction` step.

## API

### `POST /api/receipts/[id]/keep`

| Step | Behavior |
| --- | --- |
| Auth | 401 if no session. |
| Ownership + status | Receipt looked up via the RLS-scoped client. 404 if not found/not owned, 409 if not `duplicate`. |
| Write | Admin client calls `keep_duplicate_receipt`. 409 if it returns null (resolved or deleted in the meantime), 500 on a database error. |
| Queue OCR | If the new status is `processing`, sends `receipt/uploaded` via `enqueueReceiptProcessing`. 503 if Inngest can't be reached (the receipt is marked `failed`, so it can be retried). |
| Success | `{ status: "needs_review" \| "processing" }`. |

### `GET /api/receipts`

Each receipt now also has `original: { id, original_filename, created_at } | null`: the receipt a `duplicate` matches. It's looked up in a second query, because the original may be older than the 50 most recent receipts. It's null for non-duplicates, and when the original was deleted.

## Frontend

- **`ReceiptStatusBadge`**: `duplicate` → "Probable duplicate" (destructive variant, copy icon).
- **`DuplicateActions`** (`components/receipts/duplicate-actions.tsx`): "Keep anyway" and "Discard" buttons with pending states and toasts. Keeping an image duplicate toasts "Receipt kept. Reading it now."
- **`DuplicateNote`**: "Matches “x.jpg”, uploaded 2 days ago". If the original was deleted, it reads "Matches a receipt you already uploaded." It can make the original's name a button.
- **Upload page (`RecentUploads`)**: for a duplicate, the note replaces the size/time line, and Keep anyway / Discard sit below it in place of the delete button.
- **Receipts page (`ReceiptsTable`)**:
  - The status cell shows the note. Clicking the original's name opens the original's extraction sheet.
  - The actions are View extraction (available for data-check duplicates, which have an extraction; the sheet is read-only since the status isn't `needs_review`) plus Keep anyway / Discard, in place of delete.
- **`useReceipts`**: Realtime also refetches when a receipt becomes `duplicate`, to load its `original` and extraction.

## Not Included / Future Work

- Fuzzy matching (near-equal amounts, merchant name similarity, perceptual image hashes for re-compressed or cropped copies of the same photo).
- Comparing item names or quantities.
- A side-by-side comparison view of the duplicate and the original.
- Un-dismissing a kept duplicate, or re-running the check after the user edits a receipt in review.
