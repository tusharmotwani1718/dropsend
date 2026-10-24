import type { Metadata } from "next";
import { Suspense } from "react";
import {
  ReceiptsTable,
  ReceiptsTableSkeleton,
} from "@/components/receipts/receipts-table";

export const metadata: Metadata = { title: "Receipts" };

export default function ReceiptsPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Receipts
        </h1>
        <p className="text-sm text-muted-foreground">
          All your uploaded receipts and the details read from them.
        </p>
      </div>
      {/* The table reads its sort and filters from the URL. */}
      <Suspense fallback={<ReceiptsTableSkeleton />}>
        <ReceiptsTable />
      </Suspense>
    </div>
  );
}
