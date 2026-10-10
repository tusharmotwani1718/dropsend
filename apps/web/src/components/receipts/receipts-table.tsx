"use client";

import { ExternalLink, FileSearch, ImageIcon } from "lucide-react";
import { useState } from "react";
import { DuplicateActions, DuplicateNote } from "@/components/receipts/duplicate-actions";
import { ExtractionSheet } from "@/components/receipts/extraction-sheet";
import { ReceiptActions } from "@/components/receipts/receipt-actions";
import { ReceiptStatusBadge } from "@/components/receipts/receipt-status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useReceipts } from "@/hooks/use-receipts";
import { formatDate, formatMoney, formatRelativeTime } from "@/lib/format";
import type { ReceiptWithPreview } from "@/lib/receipts/client";
import type { ReceiptStatus } from "@/lib/receipts/constants";
import { CATEGORY_LABELS } from "@/lib/receipts/labels";

/**
 * Statuses that can have an extraction to view. A duplicate only has one if
 * it was flagged after OCR (not on an identical image).
 */
const EXTRACTED_STATUSES: ReceiptStatus[] = ["needs_review", "saved", "duplicate"];

export function ReceiptsTable() {
  const { receipts, loading, error, refresh } = useReceipts({ all: true });
  const [viewing, setViewing] = useState<ReceiptWithPreview | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  function view(receipt: ReceiptWithPreview) {
    setViewing(receipt);
    setSheetOpen(true);
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (receipts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No receipts uploaded yet.
      </p>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Receipt</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Image</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {receipts.map((receipt) => {
              const original = receipt.original
                ? receipts.find((r) => r.id === receipt.original?.id)
                : undefined;
              return (
                <ReceiptTableRow
                  key={receipt.id}
                  receipt={receipt}
                  onView={() => view(receipt)}
                  onViewOriginal={original && (() => view(original))}
                  onChange={() => void refresh()}
                />
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ExtractionSheet
        receipt={viewing}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSaved={() => void refresh()}
      />
    </>
  );
}

function ReceiptTableRow({
  receipt,
  onView,
  onViewOriginal,
  onChange,
}: {
  receipt: ReceiptWithPreview;
  onView: () => void;
  /** Opens the receipt a flagged duplicate matches, if it's in the table. */
  onViewOriginal?: () => void;
  onChange: () => void;
}) {
  const { extraction } = receipt;
  const canView = EXTRACTED_STATUSES.includes(receipt.status) && extraction !== null;

  return (
    <TableRow>
      <TableCell>
        <div className="flex max-w-56 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
            {receipt.preview_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={receipt.preview_url}
                alt=""
                className="size-9 object-cover"
              />
            ) : (
              <ImageIcon className="size-4 text-muted-foreground" />
            )}
          </div>
          <span className="truncate font-medium" title={receipt.original_filename}>
            {receipt.original_filename}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <ReceiptStatusBadge status={receipt.status} />
          {receipt.status === "failed" && receipt.error && (
            <span
              className="max-w-48 truncate text-xs text-destructive"
              title={receipt.error}
            >
              {receipt.error}
            </span>
          )}
          {receipt.status === "duplicate" && (
            <span className="max-w-56 text-xs text-muted-foreground">
              <DuplicateNote
                original={receipt.original}
                onViewOriginal={onViewOriginal}
              />
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="max-w-40 truncate">{extraction?.merchant ?? "—"}</TableCell>
      <TableCell className="text-right tabular-nums">
        {extraction?.amount != null
          ? formatMoney(extraction.amount, extraction.currency)
          : "—"}
      </TableCell>
      <TableCell>{extraction?.date ? formatDate(extraction.date) : "—"}</TableCell>
      <TableCell>
        {extraction?.category ? CATEGORY_LABELS[extraction.category] : "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatRelativeTime(receipt.created_at)}
      </TableCell>
      <TableCell>
        {receipt.preview_url ? (
          <a
            href={receipt.preview_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
          >
            View
            <ExternalLink className="size-3" />
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Button variant="outline" size="sm" disabled={!canView} onClick={onView}>
            <FileSearch />
            View extraction
          </Button>
          {receipt.status === "duplicate" ? (
            <DuplicateActions receipt={receipt} onChange={onChange} />
          ) : (
            <ReceiptActions receipt={receipt} showRetry={false} onChange={onChange} />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
