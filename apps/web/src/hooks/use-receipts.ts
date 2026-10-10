"use client";

import { useCallback, useEffect, useState } from "react";
import type { Receipt } from "@/lib/receipts/constants";
import { fetchReceipts, type ReceiptWithPreview } from "@/lib/receipts/client";
import { createClient } from "@/lib/supabase/client";

/**
 * The user's recent receipts (or all of them with `all`), kept live with
 * Supabase Realtime. RLS ensures the channel only receives the current
 * user's rows.
 */
export function useReceipts({ all = false } = {}) {
  const [receipts, setReceipts] = useState<ReceiptWithPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await fetchReceipts({ all });
    if (result.ok) {
      setReceipts(result.data.receipts);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [all]);

  useEffect(() => {
    // Initial load; state updates happen after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();

    const supabase = createClient();
    // A unique topic per subscription: the client reuses a channel with the
    // same topic, so a remount (e.g. React Strict Mode) would otherwise pick
    // up the channel the cleanup is still tearing down, and get no events.
    const channel = supabase
      .channel(`receipts-changes:${crypto.randomUUID()}`)
      .on<Receipt>(
        "postgres_changes",
        { event: "*", schema: "public", table: "receipts" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const { id } = payload.old;
            setReceipts((current) => current.filter((r) => r.id !== id));
            return;
          }

          const updated = payload.new;
          setReceipts((current) => {
            const index = current.findIndex((r) => r.id === updated.id);
            if (index === -1) return current;
            const next = [...current];
            next[index] = { ...current[index], ...updated };
            return next;
          });

          // New rows and newly verified images need a signed preview URL,
          // which only the server can create, and newly extracted receipts
          // need their extraction (and flagged duplicates the receipt they
          // match), which aren't part of the receipts row.
          if (
            payload.eventType === "INSERT" ||
            updated.status === "processing" ||
            updated.status === "needs_review" ||
            updated.status === "duplicate"
          ) {
            void refresh();
          }
        },
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(`Receipts realtime ${status}`, err);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { receipts, loading, error, refresh };
}
