import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ReceiptStatus } from "@/lib/receipts/constants";
import { STATUS_LABELS } from "@/lib/receipts/labels";

const STATUS_VARIANTS: Record<
  ReceiptStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  uploading: "secondary",
  uploaded: "default",
  processing: "secondary",
  needs_review: "outline",
  saved: "default",
  failed: "destructive",
};

export function ReceiptStatusBadge({ status }: { status: ReceiptStatus }) {
  return (
    <Badge variant={STATUS_VARIANTS[status]}>
      {(status === "uploading" || status === "processing") && (
        <Loader2 className="animate-spin" />
      )}
      {STATUS_LABELS[status]}
    </Badge>
  );
}
