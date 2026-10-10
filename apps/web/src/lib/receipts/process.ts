import "server-only";
import { createHash } from "node:crypto";
import { inngest } from "@/inngest/client";
import { receiptUploaded } from "@/inngest/events";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  RECEIPTS_BUCKET,
  type ReceiptMimeType,
} from "@/lib/receipts/constants";

const STALE_UPLOAD_MINUTES = 10;

/** Checks the file's leading bytes match the declared image type. */
function matchesMimeType(bytes: Uint8Array, mimeType: ReceiptMimeType) {
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((byte, i) => bytes[offset + i] === byte);

  switch (mimeType) {
    case "image/jpeg":
      return startsWith([0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      // "RIFF" .... "WEBP"
      return (
        startsWith([0x52, 0x49, 0x46, 0x46]) &&
        startsWith([0x57, 0x45, 0x42, 0x50], 8)
      );
  }
}

/**
 * Verifies an uploaded receipt image and moves the receipt from `uploading`
 * to `processing`, `duplicate` (the user already has this exact image) or
 * `failed`. Status changes reach the client via Realtime.
 * Returns true if the receipt is ready for OCR.
 *
 * Runs inside the Inngest worker. Problems with the file itself fail the
 * receipt right away; unexpected errors (database, Storage) are thrown so
 * Inngest retries them.
 */
export async function verifyReceipt(receiptId: string) {
  const admin = createAdminClient();

  const { data: receipt, error: fetchError } = await admin
    .from("receipts")
    .select("id, storage_path, mime_type, status")
    .eq("id", receiptId)
    .maybeSingle();

  if (fetchError) throw new Error(`Failed to load receipt: ${fetchError.message}`);
  // Deleted, or already handled.
  if (!receipt) return false;
  // Verified by an earlier attempt whose result wasn't recorded.
  if (receipt.status === "processing") return true;
  if (receipt.status !== "uploading") return false;

  const fail = async (message: string) => {
    await failReceipts([{ id: receiptId, error: message }]);
    return false;
  };

  const bucket = admin.storage.from(RECEIPTS_BUCKET);
  // Resolves false for a missing file; throws (→ retry) on other errors.
  const { data: exists } = await bucket.exists(receipt.storage_path);
  if (!exists) {
    return fail("The image was not uploaded. Please try again.");
  }

  const { data: file, error: downloadError } = await bucket.download(
    receipt.storage_path,
  );
  if (downloadError || !file) {
    throw new Error(`Failed to download image: ${downloadError?.message}`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (!matchesMimeType(bytes, receipt.mime_type)) {
    // Not a real image of the declared type; don't keep it.
    await bucket.remove([receipt.storage_path]);
    return fail("This file is not a valid JPG, PNG or WebP image.");
  }

  const imageHash = createHash("sha256").update(bytes).digest("hex");

  // Moves it to `processing`, or to `duplicate` (no OCR) on an image match.
  const { data: status, error: updateError } = await admin.rpc(
    "mark_receipt_verified",
    { p_receipt_id: receiptId, p_image_hash: imageHash },
  );
  if (updateError) {
    throw new Error(`Failed to update receipt: ${updateError.message}`);
  }
  // Null if the receipt was deleted in the meantime.
  return status === "processing";
}

/**
 * Hands receipts to the Inngest worker (one `receipt/uploaded` event each).
 * If Inngest can't be reached, the receipts are marked failed so the user
 * can retry; if that also fails, this throws. Callers must have checked the
 * receipts belong to `userId`.
 */
export async function enqueueReceiptProcessing(
  userId: string,
  receiptIds: string[],
) {
  if (receiptIds.length === 0) return { ok: true as const };

  try {
    await inngest.send(
      receiptIds.map((receiptId) => receiptUploaded.create({ receiptId, userId })),
    );
    return { ok: true as const };
  } catch (error) {
    console.error("Failed to send receipt/uploaded events", error);
    await failReceipts(
      receiptIds.map((id) => ({
        id,
        error: "Couldn't start processing. Please try again.",
      })),
    );
    return { ok: false as const };
  }
}

/**
 * Marks the given receipts (still `uploading` or `processing`) as failed with
 * a reason. Throws if any update fails, so callers don't report success while
 * the receipt is left stuck.
 */
export async function failReceipts(
  failures: { id: string; error: string }[],
) {
  if (failures.length === 0) return;
  const admin = createAdminClient();

  const results = await Promise.all(
    failures.map(({ id, error }) =>
      admin
        .from("receipts")
        .update({ status: "failed", error: error || "Upload failed." })
        .eq("id", id)
        .in("status", ["uploading", "processing"]),
    ),
  );

  const failedUpdate = results.find((result) => result.error);
  if (failedUpdate?.error) {
    throw new Error(
      `Failed to mark receipts as failed: ${failedUpdate.error.message}`,
    );
  }
}

/**
 * Marks the user's receipts stuck in `uploading` (e.g. the tab was closed
 * mid-upload) as failed. Called lazily when the user lists their receipts.
 */
export async function failStaleUploads(userId: string) {
  const cutoff = new Date(
    Date.now() - STALE_UPLOAD_MINUTES * 60 * 1000,
  ).toISOString();

  const { error } = await createAdminClient()
    .from("receipts")
    .update({
      status: "failed",
      error: "The upload did not finish. Please try again.",
    })
    .eq("user_id", userId)
    .eq("status", "uploading")
    .lt("updated_at", cutoff);

  // Not fatal: the list still loads, and the next list request tries again.
  if (error) console.error("Failed to fail stale uploads", error);
}
