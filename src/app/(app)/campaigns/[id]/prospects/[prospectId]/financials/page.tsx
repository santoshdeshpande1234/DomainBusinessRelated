import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Notice, PageHeader, Stat } from "@/components/ui";
import { Submit } from "@/components/submit";
import { CashChart } from "@/components/cash-chart";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { money, num, when } from "@/lib/format";
import { FIELDS, UPLIFT_FIELDS, computeModel, formulas, type Input, type ModelKind } from "@/lib/studio/financial";
import { ModelForm } from "./form";
import { applyStarter } from "./actions";

export const metadata = { title: "Financial opportunity" };

const BASIS_LABEL = { actual: "From the business", benchmark: "Benchmark", assumption: "Assumption" } as const;

export default async function FinancialsPage({ params }: { params: Promise<{ id: string; prospectId: string }> }) {
  const { id, prospectId } = await params;
  const s = await getSession();
  const db = await userClient();
  const [{ data: p }, { data: c }, { data: m }] = await Promise.all([
    db.from("prospects").select("id, name").eq("id", prospectId).eq("campaign_id", id).maybeSingle(),
    db.from("campaigns").select("name, currency").eq("id", id).maybeSingle(),
    db.from("financial_models").select("*").eq("prospect_id", prospectId).maybeSingle(),
  ]);
  if (!p || !c) notFound();
  const write = can(s.role, "campaign:write");
  const model = (m?.model ?? "lead_gen") as ModelKind;
  const inputs = (m?.inputs ?? {}) as Record<string, Input>;
  // Recomputed on every view from the stored inputs, so results always match the formulas shown.
  const r = computeModel(model, inputs);
  const $ = (n: number) => money(n, c.currency, { maximumFractionDigits: 0 });
  const short = (n: number) => money(n, c.currency, { notation: "compact", maximumFractionDigits: 1 });
  const n1 = (v: number) => num(Math.round(v * 10) / 10);
  const base = `/campaigns/${id}/prospects/${prospectId}`;
  const assumed = Object.values(inputs).filter((x) => x.basis === "assumption").length;

  const rows: [string, (x: Exclude<typeof r, { ok: false }>["scenarios"][number] | null) => string][] = r.ok ? [
    [model === "ecommerce" ? "Sessions / month" : "Relevant visits / month", (x) => num(Math.round(x ? x.visits : r.current.visits))],
    [model === "ecommerce" ? "Orders / month" : "Inquiries / month", (x) => n1(x ? x.leads : r.current.leads)],
    ["Customers / month", (x) => `${n1(x ? x.customers : r.current.customers)}${(x ? x.capped : r.current.capped) ? " (at capacity)" : ""}`],
    ["Revenue / month", (x) => $(x ? x.revenue : r.current.revenue)],
    ["Typical month range (seasonality)", (x) => x ? `${$(x.low_month)} – ${$(x.high_month)}` : "—"],
    ["Incremental revenue / month", (x) => x ? $(x.incremental_revenue_month) : "—"],
    ["Incremental revenue / year (full effect)", (x) => x ? $(x.incremental_revenue_year) : "—"],
    ["Incremental gross profit / month", (x) => x ? $(x.incremental_gross_profit_month) : "—"],
    ["Incremental operating profit / month", (x) => x ? $(x.incremental_operating_profit_month) : "—"],
    ["First-year revenue gain (with ramp-up)", (x) => x ? $(x.first_year_revenue) : "—"],
    ["First-year net contribution", (x) => x ? $(x.first_year_net) : "—"],
    ["First-year ROI", (x) => x?.roi != null ? `${Math.round(x.roi * 100)}%` : "—"],
    ["Payback", (x) => x ? (x.payback_month ? `Month ${x.payback_month}` : "Not within 3 years") : "—"],
    ["Staff hours saved / month", (x) => x?.hours_saved_month != null ? n1(x.hours_saved_month) : "—"],
    ["Spare customer capacity / month", (x) => x?.spare_capacity != null ? n1(x.spare_capacity) : "—"],
  ] : [];
  const baseCase = r.ok ? r.scenarios[1] : null;

  return (
    <>
      <nav className="mb-3 text-sm text-muted"><Link href={`/campaigns/${id}/prospects`} className="hover:text-ink">{c.name}</Link> / <Link href={base} className="hover:text-ink">{p.name}</Link> / </nav>
      <PageHeader title="Financial opportunity" description={`What better website conversion and visibility could be worth to ${p.name}. Calculated by code from the inputs below; estimates, not the company's verified revenue.`}
        actions={write && <form action={applyStarter.bind(null, id, prospectId)}><Submit className="btn-secondary" pending="Filling…">Fill blanks with starter assumptions</Submit></form>} />

      {r.ok && baseCase ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Base case: extra revenue / year" value={$(baseCase.incremental_revenue_year)} sub="At full effect, before costs" />
            <Stat label="Base case: first-year net" value={$(baseCase.first_year_net)} sub={`After ${$(r.costs.first_year)} of costs`} />
            <Stat label="Base case: payback" value={baseCase.payback_month ? `Month ${baseCase.payback_month}` : "Over 3 years"} sub={`Ramp-up over ${r.ramp_months} month(s)`} />
            <Stat label="Confidence" value={`${r.confidence}%`} sub={assumed ? `${assumed} input(s) are assumptions` : "Inputs are sourced"} />
          </div>
          {r.confidence < 60 && <div className="mb-6"><Notice tone="warn">Most inputs are assumptions, so treat these figures as an illustrative range, not a forecast. Ask the business for its visits, inquiry numbers and average sale to firm them up.</Notice></div>}

          <div className="mb-6 space-y-6">
            <Card title="Running net position" description="Gains minus implementation and recurring costs, month by month over two years. Hover for values.">
              <div className="mx-auto max-w-4xl"><CashChart format={short} series={r.scenarios.map((x) => ({ key: x.key, label: x.label, values: x.cumulative.slice(0, 24) }))} /></div>
            </Card>
            <Card title="Scenarios" description="Current estimate versus each scenario, per month unless stated.">
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[560px] text-sm">
                  <thead><tr className="border-b border-line text-left text-xs text-faint"><th className="py-2 pr-3 font-medium">Measure</th><th className="py-2 pr-3 text-right font-medium">Current</th>{r.scenarios.map((x) => <th key={x.key} className="py-2 pr-3 text-right font-medium">{x.label}</th>)}</tr></thead>
                  <tbody className="divide-y divide-line">
                    {rows.filter(([, f]) => r.scenarios.some((x) => f(x) !== "—")).map(([label, f]) => (
                      <tr key={label}><td className="py-1.5 pr-3">{label}</td><td className="py-1.5 pr-3 text-right tabular-nums text-muted">{f(null)}</td>{r.scenarios.map((x) => <td key={x.key} className="py-1.5 pr-3 text-right tabular-nums">{f(x)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {r.notes.length > 0 && <ul className="mt-3 space-y-1 text-xs text-warn">{r.notes.map((n) => <li key={n}>⚠ {n}</li>)}</ul>}
            </Card>
          </div>
        </>
      ) : (
        <div className="mb-6"><Notice tone="neutral">{!r.ok && Object.keys(inputs).length ? `Still needed before we can calculate: ${r.missing.join(", ")}.` : "Enter what you know about the business, or fill the blanks with starter assumptions to explore a range. Nothing is estimated until the required inputs are present."}</Notice></div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {write ? <Card title="Inputs" description={m ? `Last saved ${when(m.updated_at)}.` : undefined}><ModelForm campaignId={id} prospectId={prospectId} currency={c.currency} model={model} inputs={inputs} /></Card> : (
            <Card title="Inputs">
              <ul className="-my-2 divide-y divide-line text-sm">
                {[...FIELDS, ...UPLIFT_FIELDS].filter((f) => inputs[f.key]).map((f) => <li key={f.key} className="flex justify-between gap-3 py-2"><span>{f.label}</span><span className="tabular-nums">{f.unit === "pct" ? `${Math.round(inputs[f.key].value! * 1000) / 10}%` : num(inputs[f.key].value)}</span></li>)}
              </ul>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card title="Formulas">
            <ul className="list-disc space-y-1.5 pl-5 text-xs text-muted">{formulas(model).map((f) => <li key={f}>{f}</li>)}</ul>
          </Card>
          <Card title="Where the inputs come from">
            {Object.keys(inputs).length ? (
              <ul className="space-y-2 text-xs">
                {[...FIELDS, ...UPLIFT_FIELDS].filter((f) => inputs[f.key]).map((f) => {
                  const v = inputs[f.key];
                  return (
                    <li key={f.key} className="flex flex-wrap items-baseline gap-x-2">
                      <Badge tone={v.basis === "actual" ? "good" : v.basis === "benchmark" ? "accent" : "warn"}>{BASIS_LABEL[v.basis]}</Badge>
                      <span>{f.label}</span>
                      {v.source_url ? <a href={v.source_url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">source</a> : v.note && <span className="text-faint">{v.note}</span>}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-muted">No inputs yet.</p>}
          </Card>
          <p className="text-xs text-muted">Recommendations from the <Link href={`${base}/competitors`} className="text-accent hover:underline">competitor analysis</Link> are what the scenario changes should be based on. More inquiries don&apos;t automatically become customers; that is why the close rate, lead quality and capacity are separate inputs.</p>
        </div>
      </div>
    </>
  );
}
