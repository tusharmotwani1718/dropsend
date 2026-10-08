"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
  FileSearch,
  ImageIcon,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ExtractionSheet } from "@/components/receipts/extraction-sheet";
import { ReceiptActions } from "@/components/receipts/receipt-actions";
import { ReceiptStatusBadge } from "@/components/receipts/receipt-status-badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { EXPENSE_CATEGORIES } from "@/lib/ocr/schema";
import type { ReceiptWithPreview } from "@/lib/receipts/client";
import {
  RECEIPT_STATUSES,
  type ExpenseCategory,
  type ReceiptStatus,
} from "@/lib/receipts/constants";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/receipts/labels";

/** Statuses that have an extraction to view. */
const EXTRACTED_STATUSES: ReceiptStatus[] = ["needs_review", "saved"];

// `uploaded` is no longer used, so it isn't offered as a filter.
const FILTER_STATUSES = RECEIPT_STATUSES.filter((status) => status !== "uploaded");

const ALL = "all";

const CATEGORY_ITEMS = [
  { value: ALL, label: "All categories" },
  ...EXPENSE_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })),
];

const STATUS_ITEMS = [
  { value: ALL, label: "All statuses" },
  ...FILTER_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
];

type SortKey = "amount" | "date";
type Sort = { key: SortKey; order: "asc" | "desc" } | null;

function oneOf<T extends string>(values: readonly T[], value: string | null) {
  return values.find((v) => v === value) ?? null;
}

/**
 * Sort and filters, kept in the URL (`?category=&status=&sort=&order=`) so
 * they survive a reload. Unknown values are ignored.
 */
function useTableParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const category = oneOf(EXPENSE_CATEGORIES, searchParams.get("category"));
  const status = oneOf(FILTER_STATUSES, searchParams.get("status"));
  const sortKey = oneOf<SortKey>(["amount", "date"], searchParams.get("sort"));
  const sort: Sort = sortKey
    ? { key: sortKey, order: searchParams.get("order") === "asc" ? "asc" : "desc" }
    : null;

  function update(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    for (const [name, value] of Object.entries(changes)) {
      if (value === null) params.delete(name);
      else params.set(name, value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return {
    category,
    status,
    sort,
    setCategory: (value: ExpenseCategory | null) => update({ category: value }),
    setStatus: (value: ReceiptStatus | null) => update({ status: value }),
    /** Cycles a column through descending, ascending, then unsorted. */
    toggleSort: (key: SortKey) => {
      if (sort?.key !== key) update({ sort: key, order: "desc" });
      else if (sort.order === "desc") update({ sort: key, order: "asc" });
      else update({ sort: null, order: null });
    },
    clearFilters: () => update({ category: null, status: null }),
  };
}

/**
 * Sorts by amount or receipt date. Receipts without the value always go
 * last; ties keep the newest-upload-first order. Amounts are compared as
 * plain numbers, whatever their currency.
 */
function sortReceipts(receipts: ReceiptWithPreview[], sort: Sort) {
  if (!sort) return receipts;
  const direction = sort.order === "asc" ? 1 : -1;
  const valueOf = (receipt: ReceiptWithPreview) =>
    receipt.extraction?.[sort.key] ?? null;

  return [...receipts].sort((a, b) => {
    const x = valueOf(a);
    const y = valueOf(b);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return x < y ? -direction : x > y ? direction : 0;
  });
}

export function ReceiptsTable() {
  const { receipts, loading, error, refresh } = useReceipts({ all: true });
  const params = useTableParams();
  const { category, status, sort } = params;
  const [viewing, setViewing] = useState<ReceiptWithPreview | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const visible = useMemo(
    () =>
      sortReceipts(
        receipts.filter(
          (receipt) =>
            (!category || receipt.extraction?.category === category) &&
            (!status || receipt.status === status),
        ),
        sort,
      ),
    [receipts, category, status, sort],
  );

  if (loading) {
    return <ReceiptsTableSkeleton />;
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

  const filtered = category !== null || status !== null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={CATEGORY_ITEMS}
          value={category ?? ALL}
          onValueChange={(value) => params.setCategory(oneOf(EXPENSE_CATEGORIES, value))}
        >
          <SelectTrigger className="w-44" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={STATUS_ITEMS}
          value={status ?? ALL}
          onValueChange={(value) => params.setStatus(oneOf(FILTER_STATUSES, value))}
        >
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={params.clearFilters}>
            Clear filters
          </Button>
        )}
        <p className="ml-auto text-sm text-muted-foreground">
          {filtered
            ? `${visible.length} of ${receipts.length} receipts`
            : `${receipts.length} ${receipts.length === 1 ? "receipt" : "receipts"}`}
        </p>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Receipt</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Merchant</TableHead>
              <SortableHead
                label="Amount"
                sortKey="amount"
                sort={sort}
                onSort={params.toggleSort}
                className="text-right"
              />
              <SortableHead
                label="Date"
                sortKey="date"
                sort={sort}
                onSort={params.toggleSort}
              />
              <TableHead>Category</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Image</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  No receipts match these filters.
                </TableCell>
              </TableRow>
            )}
            {visible.map((receipt) => (
              <ReceiptTableRow
                key={receipt.id}
                receipt={receipt}
                onView={() => {
                  setViewing(receipt);
                  setSheetOpen(true);
                }}
                onChange={() => void refresh()}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <ExtractionSheet
        receipt={viewing}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}

export function ReceiptsTableSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const order = sort?.key === sortKey ? sort.order : null;
  const Icon = order === "asc" ? ArrowUp : order === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <TableHead
      className={className}
      aria-sort={order === "asc" ? "ascending" : order === "desc" ? "descending" : "none"}
    >
      <Button variant="ghost" size="sm" className="-mx-2.5" onClick={() => onSort(sortKey)}>
        {label}
        <Icon className={order ? undefined : "text-muted-foreground"} />
      </Button>
    </TableHead>
  );
}

function ReceiptTableRow({
  receipt,
  onView,
  onChange,
}: {
  receipt: ReceiptWithPreview;
  onView: () => void;
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
          <ReceiptActions receipt={receipt} showRetry={false} onChange={onChange} />
        </div>
      </TableCell>
    </TableRow>
  );
}
