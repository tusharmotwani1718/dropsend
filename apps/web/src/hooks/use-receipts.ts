"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Receipt, ReceiptStatus } from "@/lib/receipts/constants";
import { fetchReceipts, type ReceiptWithPreview } from "@/lib/receipts/client";
import { createClient } from "@/lib/supabase/client";

/** Statuses the background worker will still change on its own. */
const PENDING_STATUSES: ReceiptStatus[] = ["uploading", "processing"];

/** Safety net while receipts are pending, in case Realtime misses events. */
const POLL_INTERVAL_MS = 5000;

/** Coalesces a burst of Realtime events (e.g. a batch upload) into one fetch. */
const REFRESH_DEBOUNCE_MS = 250;

/**
 * The user's recent receipts (or all of them with `all`), kept live with
 * Supabase Realtime. RLS ensures the channel only receives the current
 * user's rows.
 *
 * Realtime events are applied right away, then the list is refetched from
 * the server (for signed preview URLs, extractions and duplicate originals).
 * Only the most recent fetch is applied, so a slow response can't overwrite
 * newer data with an older status.
 */
export function useReceipts({ all = false } = {}) {
  const [receipts, setReceipts] = useState<ReceiptWithPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bumped by every fetch and every Realtime event; a response is applied
  // only if nothing newer happened while it was in flight.
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    const result = await fetchReceipts({ all });
    if (current !== generation.current) return;

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

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
    };

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
          // Any fetch already in flight may have read the row before this
          // change; drop its result; the refresh below replaces it.
          generation.current++;

          if (payload.eventType === "DELETE") {
            const { id } = payload.old;
            setReceipts((current) => current.filter((r) => r.id !== id));
          } else {
            const updated = payload.new;
            setReceipts((current) => {
              const index = current.findIndex((r) => r.id === updated.id);
              if (index === -1) return current;
              const next = [...current];
              next[index] = { ...current[index], ...updated };
              return next;
            });
          }

          scheduleRefresh();
        },
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          // Catch up on changes made before the channel was ready (including
          // the gap after the initial fetch) or while it was reconnecting.
          scheduleRefresh();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(`Receipts realtime ${status}`, err);
        }
      });

    return () => {
      clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const hasPending = receipts.some((r) => PENDING_STATUSES.includes(r.status));

  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasPending, refresh]);

  return { receipts, loading, error, refresh };
}
