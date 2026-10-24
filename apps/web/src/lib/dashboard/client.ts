import type { DatePreset, DashboardSummaryResponse } from "@/lib/dashboard/constants";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function request<T>(url: string): Promise<Result<T>> {
  try {
    const response = await fetch(url);
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error ?? "Something went wrong. Please try again.",
      };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, error: "Network error. Please check your connection." };
  }
}

export function fetchDashboardSummary(
  preset: DatePreset,
  custom?: { from: string; to: string },
) {
  const params = new URLSearchParams({ preset });
  if (preset === "custom" && custom) {
    params.set("from", custom.from);
    params.set("to", custom.to);
  }
  return request<DashboardSummaryResponse>(`/api/dashboard/summary?${params.toString()}`);
}
