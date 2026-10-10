import { Copy, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ReceiptStatus } from "@/lib/receipts/constants";

const STATUS_BADGES: Record<
  ReceiptStatus,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  uploading: { label: "Uploading", variant: "secondary" },
  uploaded: { label: "Uploaded", variant: "default" },
  processing: { label: "Processing", variant: "secondary" },
  needs_review: { label: "Needs review", variant: "outline" },
  saved: { label: "Saved", variant: "default" },
  duplicate: { label: "Probable duplicate", variant: "destructive" },
  failed: { label: "Failed", variant: "destructive" },
};

export function ReceiptStatusBadge({ status }: { status: ReceiptStatus }) {
  const badge = STATUS_BADGES[status];
  return (
    <Badge variant={badge.variant}>
      {(status === "uploading" || status === "processing") && (
        <Loader2 className="animate-spin" />
      )}
      {status === "duplicate" && <Copy />}
      {badge.label}
    </Badge>
  );
}
