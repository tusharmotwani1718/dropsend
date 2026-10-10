"use client";

import { ImageIcon } from "lucide-react";
import { DuplicateActions, DuplicateNote } from "@/components/receipts/duplicate-actions";
import { ReceiptActions } from "@/components/receipts/receipt-actions";
import { ReceiptStatusBadge } from "@/components/receipts/receipt-status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes, formatRelativeTime } from "@/lib/format";
import type { ReceiptWithPreview } from "@/lib/receipts/client";

type RecentUploadsProps = {
  receipts: ReceiptWithPreview[];
  loading: boolean;
  error: string | null;
  /** Original files from this session, by receipt id, for re-uploading. */
  getFile: (receiptId: string) => File | undefined;
  onChange: () => void;
};

export function RecentUploads({
  receipts,
  loading,
  error,
  getFile,
  onChange,
}: RecentUploadsProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-foreground">Recent uploads</h2>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : receipts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No receipts uploaded yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {receipts.map((receipt) => (
            <ReceiptRow
              key={receipt.id}
              receipt={receipt}
              file={getFile(receipt.id)}
              onChange={onChange}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReceiptRow({
  receipt,
  file,
  onChange,
}: {
  receipt: ReceiptWithPreview;
  file: File | undefined;
  onChange: () => void;
}) {
  const isDuplicate = receipt.status === "duplicate";

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {receipt.preview_url ? (
          <a href={receipt.preview_url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={receipt.preview_url}
              alt={receipt.original_filename}
              className="size-12 object-cover"
            />
          </a>
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {receipt.original_filename}
          </p>
          <ReceiptStatusBadge status={receipt.status} />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {receipt.status === "failed" && receipt.error ? (
            <span className="text-destructive">{receipt.error}</span>
          ) : isDuplicate ? (
            <DuplicateNote original={receipt.original} />
          ) : (
            <>
              {formatBytes(receipt.size_bytes)} · {formatRelativeTime(receipt.created_at)}
            </>
          )}
        </p>
        {isDuplicate && (
          <div className="mt-2 flex flex-wrap gap-2">
            <DuplicateActions receipt={receipt} onChange={onChange} />
          </div>
        )}
      </div>

      {!isDuplicate && (
        <div className="flex shrink-0 items-center gap-1">
          <ReceiptActions receipt={receipt} file={file} onChange={onChange} />
        </div>
      )}
    </li>
  );
}
