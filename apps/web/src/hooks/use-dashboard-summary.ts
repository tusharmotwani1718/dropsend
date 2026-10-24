"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDashboardSummary } from "@/lib/dashboard/client";
import type { DashboardSummaryResponse, DatePreset } from "@/lib/dashboard/constants";

/** Fetches dashboard totals for the selected preset/custom range. */
export function useDashboardSummary(
  preset: DatePreset,
  custom?: { from: string; to: string },
) {
  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Guards against an older, slower request resolving after a newer one and
  // overwriting its (more current) result.
  const requestId = useRef(0);

  const customFrom = custom?.from;
  const customTo = custom?.to;

  const refresh = useCallback(async () => {
    const thisRequestId = ++requestId.current;

    // Custom range selected but not fully picked yet: nothing to fetch.
    if (preset === "custom" && (!customFrom || !customTo)) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const result = await fetchDashboardSummary(
      preset,
      preset === "custom" ? { from: customFrom!, to: customTo! } : undefined,
    );

    if (thisRequestId !== requestId.current) return; // superseded, ignore

    if (result.ok) {
      setData(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    // Initial load and every preset/range change; state updates after fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
