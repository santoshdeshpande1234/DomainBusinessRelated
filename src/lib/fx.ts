import "server-only";
import { adminClient } from "@/lib/supabase/server";
import { isFresh, usdPerUnit, type Rates } from "@/lib/fx-math";
import { CURRENCIES } from "@/lib/options";

const PROVIDER = "open.er-api.com";

export type RateTable = { rates: Rates; fetched_at: string; provider: string; provider_updated_at: string | null };

/** USD-based rates, cached for 12 hours in fx_rates. Falls back to the last cached table if the provider is down. */
export async function getRates(workspaceId: string | null): Promise<RateTable> {
  const db = adminClient();
  const { data: cached } = await db.from("fx_rates").select("*").eq("base", "USD").maybeSingle();
  if (cached && isFresh(cached.fetched_at)) return cached as RateTable;
  const started = Date.now();
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok || body.result !== "success") throw new Error("bad response");
    const rates: Rates = {};
    for (const c of CURRENCIES) if (body.rates?.[c]) rates[c] = body.rates[c];
    const row = { base: "USD", rates, provider: PROVIDER, provider_updated_at: body.time_last_update_utc ?? null, fetched_at: new Date().toISOString() };
    await db.from("fx_rates").upsert(row);
    await db.from("api_usage").insert({ workspace_id: workspaceId, provider: PROVIDER, operation: "latest_rates", units: 1, est_cost_usd: 0, latency_ms: Date.now() - started });
    return row;
  } catch {
    await db.from("api_usage").insert({ workspace_id: workspaceId, provider: PROVIDER, operation: "latest_rates", status: "error", latency_ms: Date.now() - started });
    if (cached) return cached as RateTable;
    throw new Error("Exchange rates are unavailable right now. Please try again shortly.");
  }
}

export async function fxSnapshot(currency: string, workspaceId: string) {
  const t = await getRates(workspaceId);
  return { currency, usd_per_unit: usdPerUnit(currency, t.rates), fetched_at: t.fetched_at, provider: t.provider };
}
