import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { getSession } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { money, num, when } from "@/lib/format";

export const metadata = { title: "API usage" };

export default async function Usage() {
  const s = await getSession();
  const db = await userClient();
  const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [{ data: rows = [] }, { data: ws }, { data: recent = [] }] = await Promise.all([
    db.from("api_usage").select("provider, operation, units, est_cost_usd, status").gte("created_at", start).limit(10000),
    db.from("workspaces").select("monthly_api_budget_usd").eq("id", s.workspace.id).single(),
    db.from("api_usage").select("id, provider, operation, units, est_cost_usd, status, latency_ms, created_at").order("created_at", { ascending: false }).limit(50),
  ]);
  const spend = rows!.reduce((t, r) => t + Number(r.est_cost_usd ?? 0), 0);
  const budget = ws?.monthly_api_budget_usd as number | null;
  const byProvider = new Map<string, { calls: number; errors: number; cost: number }>();
  for (const r of rows!) {
    const b = byProvider.get(r.provider) ?? { calls: 0, errors: 0, cost: 0 };
    b.calls++; if (r.status !== "ok") b.errors++; b.cost += Number(r.est_cost_usd ?? 0);
    byProvider.set(r.provider, b);
  }
  const pct = budget ? Math.min(100, (spend / budget) * 100) : null;

  return (
    <>
      <PageHeader title="API usage" description="Every external call is logged with its estimated cost. Month to date, UTC." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Estimated spend" value={money(spend, "USD")} sub={budget != null ? `of ${money(budget, "USD")} monthly budget` : "No monthly budget set"} />
        <Stat label="Calls" value={num(rows!.length)} sub={`${num(rows!.filter((r) => r.status !== "ok").length)} failed`} />
        <Stat label="Providers used" value={num(byProvider.size)} />
      </div>
      {pct != null && (
        <div className="mb-6" aria-label={`Budget used: ${pct.toFixed(0)}%`}>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className={`h-full rounded-full ${pct >= 90 ? "bg-bad" : pct >= 70 ? "bg-warn" : "bg-accent"}`} style={{ width: `${pct}%` }} /></div>
          <p className="mt-1 text-xs text-muted">{pct.toFixed(0)}% of budget used</p>
        </div>
      )}
      {recent!.length === 0 ? (
        <Empty title="No API calls yet">Calls appear here once modules start using providers. Exchange-rate lookups are free and cached for 12 hours.</Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="By provider (this month)">
            <table className="table -mx-5 -my-5 w-[calc(100%+2.5rem)]">
              <thead><tr><th>Provider</th><th className="text-right">Calls</th><th className="text-right">Cost</th></tr></thead>
              <tbody>{[...byProvider].map(([p, b]) => <tr key={p}><td>{p}{b.errors > 0 && <span className="ml-1 text-xs text-bad">{b.errors} failed</span>}</td><td className="text-right tabular-nums">{num(b.calls)}</td><td className="text-right tabular-nums">{money(b.cost, "USD")}</td></tr>)}</tbody>
            </table>
          </Card>
          <div className="card overflow-x-auto lg:col-span-2">
            <table className="table">
              <thead><tr><th>When</th><th>Provider</th><th>Operation</th><th className="text-right">Cost</th><th>Status</th></tr></thead>
              <tbody>{recent!.map((r) => (
                <tr key={r.id}><td className="whitespace-nowrap text-muted">{when(r.created_at)}</td><td>{r.provider}</td><td className="text-muted">{r.operation}</td>
                  <td className="text-right tabular-nums">{money(Number(r.est_cost_usd ?? 0), "USD")}</td><td className={r.status === "ok" ? "text-good" : "text-bad"}>{r.status}{r.latency_ms != null && <span className="ml-1 text-xs text-faint">{r.latency_ms} ms</span>}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
