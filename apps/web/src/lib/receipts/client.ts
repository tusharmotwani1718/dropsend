import { createClient } from "@/lib/supabase/client";
import {
  MAX_RECEIPTS_PER_BATCH,
  RECEIPTS_BUCKET,
  type DuplicateOriginal,
  type ExtractionDetail,
  type ExtractionSummary,
  type Receipt,
} from "@/lib/receipts/constants";
import {
  receiptFileSchema,
  type UpdateExtractionOutput,
} from "@/lib/receipts/schemas";

export type ReceiptWithPreview = Receipt & {
  preview_url: string | null;
  extraction: ExtractionSummary | null;
  /** For a flagged duplicate, the receipt it matches (null if deleted). */
  original: DuplicateOriginal | null;
};

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function request<T>(url: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error ?? "Something went wrong. Please try again.",
      };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, error: "Network error. Please check your connection." };
  }
}

/** Returns the reason a file can't be uploaded, or null if it's valid. */
export function validateReceiptFile(file: File): string | null {
  const result = receiptFileSchema.safeParse({
    name: file.name,
    size: file.size,
    type: file.type,
  });
  return result.success ? null : (result.error.issues[0]?.message ?? "Invalid file");
}

async function uploadToStorage(path: string, token: string, file: File) {
  const { error } = await createClient()
    .storage.from(RECEIPTS_BUCKET)
    .uploadToSignedUrl(path, token, file, { contentType: file.type });
  return error?.message ?? null;
}

const COMPLETE_ATTEMPTS = 3;

/**
 * Reports upload results to the server. Retried on failure: by this point the
 * files are already in Storage, and the server only acts on receipts that are
 * still `uploading`, so repeating the call is safe.
 */
async function completeUploads(
  uploaded: string[],
  failed: { id: string; error: string }[],
) {
  const send = () =>
    request("/api/receipts/complete", {
      method: "POST",
      body: JSON.stringify({ uploaded, failed }),
    });

  let result = await send();
  for (let attempt = 1; attempt < COMPLETE_ATTEMPTS && !result.ok; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    result = await send();
  }
  return result;
}

/**
 * Uploads up to MAX_RECEIPTS_PER_BATCH files: gets signed upload tokens,
 * uploads each file straight to Storage in parallel, then reports the result.
 * Returns the receipt id for each file (in order) so the caller can keep the
 * File around for retries, how many files failed, and `completeError` if the
 * server couldn't be told about the uploads (receipts stay `uploading` until
 * the stale-upload check marks them failed).
 */
export async function uploadReceipts(files: File[]): Promise<
  Result<{
    receiptIds: string[];
    failedCount: number;
    completeError: string | null;
  }>
> {
  if (files.length > MAX_RECEIPTS_PER_BATCH) {
    return {
      ok: false,
      error: `You can upload up to ${MAX_RECEIPTS_PER_BATCH} images at a time`,
    };
  }

  const urls = await request<{
    uploads: { receiptId: string; path: string; token: string | null }[];
  }>("/api/receipts/upload-urls", {
    method: "POST",
    body: JSON.stringify({
      files: files.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
      })),
    }),
  });
  if (!urls.ok) return urls;

  const { uploads } = urls.data;
  const outcomes = await Promise.all(
    uploads.map(async (upload, i) => ({
      id: upload.receiptId,
      // A missing token means the server already marked this receipt failed.
      error: upload.token
        ? await uploadToStorage(upload.path, upload.token, files[i])
        : "skipped",
    })),
  );

  const uploaded = outcomes.filter((o) => o.error === null).map((o) => o.id);
  const failed = outcomes
    .filter((o) => o.error !== null && o.error !== "skipped")
    .map((o) => ({ id: o.id, error: "The image could not be uploaded." }));

  const completed =
    uploaded.length + failed.length > 0
      ? await completeUploads(uploaded, failed)
      : null;

  return {
    ok: true,
    data: {
      receiptIds: uploads.map((u) => u.receiptId),
      failedCount: uploads.length - uploaded.length,
      completeError: completed && !completed.ok ? completed.error : null,
    },
  };
}

/**
 * Retries a failed receipt. Pass the original File if the browser still has
 * it, so it can be uploaded again when the image never reached Storage.
 */
export async function retryReceipt(receiptId: string, file?: File) {
  const result = await request<
    { action: "queued" } | { action: "upload"; path: string; token: string }
  >(`/api/receipts/${receiptId}/retry`, {
    method: "POST",
    body: JSON.stringify({ canReupload: Boolean(file) }),
  });
  if (!result.ok) return result;

  if (result.data.action === "upload" && file) {
    const uploadError = await uploadToStorage(
      result.data.path,
      result.data.token,
      file,
    );
    return completeUploads(
      uploadError ? [] : [receiptId],
      uploadError
        ? [{ id: receiptId, error: "The image could not be uploaded." }]
        : [],
    );
  }

  return { ok: true, data: null } as const;
}

/** "Keep anyway" for a receipt flagged as a probable duplicate. */
export function keepReceipt(receiptId: string) {
  return request<{ status: "needs_review" | "processing" }>(
    `/api/receipts/${receiptId}/keep`,
    { method: "POST" },
  );
}

export function deleteReceipt(receiptId: string) {
  return request(`/api/receipts/${receiptId}`, { method: "DELETE" });
}

/** The 50 most recent receipts, or every receipt with `all`. */
export function fetchReceipts({ all = false } = {}) {
  return request<{ receipts: ReceiptWithPreview[] }>(
    all ? "/api/receipts?all=true" : "/api/receipts",
  );
}

export function fetchExtraction(receiptId: string) {
  return request<{ extraction: ExtractionDetail }>(
    `/api/receipts/${receiptId}/extraction`,
  );
}

/** Saves the user's edited extraction and moves the receipt to `saved`. */
export function updateExtraction(receiptId: string, values: UpdateExtractionOutput) {
  return request(`/api/receipts/${receiptId}/extraction`, {
    method: "PATCH",
    body: JSON.stringify(values),
  });
}
