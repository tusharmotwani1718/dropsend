"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";
import {
  deleteReceipt,
  keepReceipt,
  type ReceiptWithPreview,
} from "@/lib/receipts/client";
import type { DuplicateOriginal } from "@/lib/receipts/constants";

type DuplicateActionsProps = {
  receipt: ReceiptWithPreview;
  onChange: () => void;
};

/** "Keep anyway" and "Discard" for a receipt flagged as a probable duplicate. */
export function DuplicateActions({ receipt, onChange }: DuplicateActionsProps) {
  const [pending, setPending] = useState<"keep" | "discard" | null>(null);

  async function handleKeep() {
    setPending("keep");
    const result = await keepReceipt(receipt.id);
    setPending(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.data.status === "processing"
        ? "Receipt kept. Reading it now."
        : "Receipt kept",
    );
    onChange();
  }

  // The original stays, so no confirmation: discarding is the expected choice.
  async function handleDiscard() {
    setPending("discard");
    const result = await deleteReceipt(receipt.id);
    setPending(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Duplicate discarded");
    onChange();
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={pending !== null}
        onClick={handleKeep}
      >
        {pending === "keep" ? "Keeping..." : "Keep anyway"}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={pending !== null}
        onClick={handleDiscard}
      >
        {pending === "discard" ? "Discarding..." : "Discard"}
      </Button>
    </>
  );
}

type DuplicateNoteProps = {
  original: DuplicateOriginal | null;
  /** Makes the original's name a button, e.g. to open its extraction. */
  onViewOriginal?: () => void;
};

/** "Matches “x.jpg”, uploaded 2 days ago" for a flagged duplicate. */
export function DuplicateNote({ original, onViewOriginal }: DuplicateNoteProps) {
  if (!original) {
    return <span>Matches a receipt you already uploaded.</span>;
  }

  return (
    <span>
      Matches{" "}
      {onViewOriginal ? (
        <button
          type="button"
          onClick={onViewOriginal}
          className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
        >
          {original.original_filename}
        </button>
      ) : (
        <span className="font-medium text-foreground">
          {original.original_filename}
        </span>
      )}
      , uploaded {formatRelativeTime(original.created_at)}
    </span>
  );
}
