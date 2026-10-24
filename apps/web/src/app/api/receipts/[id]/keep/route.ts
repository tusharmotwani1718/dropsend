import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-user";
import { enqueueReceiptProcessing } from "@/lib/receipts/process";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * "Keep anyway" for a receipt flagged as a probable duplicate. It won't be
 * flagged again.
 * - Flagged after OCR: moves to `needs_review` → `{ status: "needs_review" }`.
 * - Flagged on an identical image (never OCR'd): moves to `processing` and
 *   queues OCR → `{ status: "processing" }`.
 * (Discarding a duplicate is a normal `DELETE /api/receipts/[id]`.)
 */
export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/receipts/[id]/keep">,
) {
  const { id } = await ctx.params;
  const { supabase, userId } = await getSessionUser();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS: only the owner can read the receipt.
  const { data: receipt } = await supabase
    .from("receipts")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }
  if (receipt.status !== "duplicate") {
    return NextResponse.json(
      { error: "This receipt isn't flagged as a duplicate" },
      { status: 409 },
    );
  }

  const { data: status, error } = await createAdminClient().rpc(
    "keep_duplicate_receipt",
    { p_receipt_id: id },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Resolved or deleted in the meantime.
  if (!status) {
    return NextResponse.json(
      { error: "This receipt isn't flagged as a duplicate" },
      { status: 409 },
    );
  }

  if (status === "processing") {
    const queued = await enqueueReceiptProcessing(userId, [id]).catch(
      (error: unknown) => {
        console.error("Failed to queue kept receipt", error);
        return { ok: false as const };
      },
    );
    if (!queued.ok) {
      // The receipt is marked failed, so the user can retry it.
      return NextResponse.json(
        { error: "Couldn't start processing. Please try again." },
        { status: 503 },
      );
    }
  }

  return NextResponse.json({ status });
}
