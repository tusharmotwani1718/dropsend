import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-user";
import {
  RECEIPTS_BUCKET,
  type DuplicateOriginal,
  type ExtractionSummary,
  type Receipt,
} from "@/lib/receipts/constants";
import { failStaleUploads } from "@/lib/receipts/process";

const RECENT_LIMIT = 50;
const PREVIEW_URL_TTL_SECONDS = 60 * 60;

type ReceiptRow = Receipt & {
  // One-to-one (extractions.receipt_id is unique), so PostgREST embeds an
  // object, but older versions return an array.
  extraction: ExtractionSummary | ExtractionSummary[] | null;
};

/**
 * Lists the user's receipts, newest first, with signed preview URLs, the
 * extracted summary fields and, for flagged duplicates, the receipt they
 * match (`original`). Returns the most recent 50 unless `?all=true`.
 */
export async function GET(request: NextRequest) {
  const { supabase, userId } = await getSessionUser();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await failStaleUploads(userId);

  const all = request.nextUrl.searchParams.get("all") === "true";
  let query = supabase
    .from("receipts")
    .select("*, extraction:extractions(merchant, amount, currency, date, category)")
    .order("created_at", { ascending: false });
  if (!all) query = query.limit(RECENT_LIMIT);

  const { data, error } = await query.returns<ReceiptRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Looked up separately: the original may be older than the listed receipts.
  const originals = new Map<string, DuplicateOriginal>();
  const originalIds = [
    ...new Set(
      data
        .filter((receipt) => receipt.status === "duplicate" && receipt.duplicate_of)
        .map((receipt) => receipt.duplicate_of as string),
    ),
  ];
  if (originalIds.length > 0) {
    const { data: rows } = await supabase
      .from("receipts")
      .select("id, original_filename, created_at")
      .in("id", originalIds)
      .returns<DuplicateOriginal[]>();
    rows?.forEach((row) => originals.set(row.id, row));
  }

  const previewUrls = new Map<string, string>();
  if (data.length > 0) {
    const { data: signed } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrls(
        data.map((receipt) => receipt.storage_path),
        PREVIEW_URL_TTL_SECONDS,
      );

    signed?.forEach(({ path, signedUrl }) => {
      if (path && signedUrl) previewUrls.set(path, signedUrl);
    });
  }

  return NextResponse.json({
    receipts: data.map((receipt) => ({
      ...receipt,
      extraction: Array.isArray(receipt.extraction)
        ? (receipt.extraction[0] ?? null)
        : receipt.extraction,
      original:
        receipt.status === "duplicate" && receipt.duplicate_of
          ? (originals.get(receipt.duplicate_of) ?? null)
          : null,
      preview_url: previewUrls.get(receipt.storage_path) ?? null,
    })),
  });
}
