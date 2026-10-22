import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Dl, Notice, PageHeader } from "@/components/ui";
import { Submit } from "@/components/submit";
import { ScoreBreakdown, EvidenceList, type EvidenceRow } from "@/components/evidence";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { money, when } from "@/lib/format";
import { roiScenarios, valuation, type Component } from "@/lib/discovery/domains";
import { DOMAIN_STATUS_TONE, REGISTRY_LABEL, REGISTRY_TONE, scoreTone } from "@/lib/discovery/labels";
import { ComparableForm, PriceForm } from "../forms";
import { recheckDomain, setDomainStatus } from "../actions";

export const metadata = { title: "Domain" };

export default async function DomainPage({ params }: { params: Promise<{ id: string; domainId: string }> }) {
  const { id, domainId } = await params;
  const s = await getSession();
  const db = await userClient();
  const [{ data: d }, { data: c }, { data: ev = [] }] = await Promise.all([
    db.from("domains").select("*").eq("id", domainId).eq("campaign_id", id).maybeSingle(),
    db.from("campaigns").select("id, name, currency, domain_budget").eq("id", id).maybeSingle(),
    db.from("evidence").select("*").eq("domain_id", domainId).order("observed_at", { ascending: false }),
  ]);
  if (!d || !c) notFound();
  const write = can(s.role, "campaign:write");
  const comps = (ev as EvidenceRow[]).filter((e) => e.kind === "comparable_sale");
  const prices = comps.map((e) => Number(e.detail.price));
  const val = valuation(prices);
  const roi = roiScenarios(d.price == null ? null : Number(d.price), d.renewal_price == null ? null : Number(d.renewal_price), prices);
  const m = (n: number) => money(n, c.currency, { maximumFractionDigits: 0 });
  const status = async (st: string) => { "use server"; await setDomainStatus(id, [domainId], st); };

  return (
    <>
      <nav className="mb-3 text-sm text-muted"><Link href={`/campaigns/${id}`} className="hover:text-ink">{c.name}</Link> / <Link href={`/campaigns/${id}/domains`} className="hover:text-ink">Domains</Link> / </nav>
      <PageHeader title={d.name}
        description={<span className="flex flex-wrap gap-2"><Badge tone={DOMAIN_STATUS_TONE[d.status]}>{d.status}</Badge><Badge tone={REGISTRY_TONE[d.registry_status]}>{REGISTRY_LABEL[d.registry_status]}</Badge></span>}
        actions={write && (
          <>
            {d.status !== "shortlisted" && d.status !== "approved" && <form action={status.bind(null, "shortlisted")}><Submit className="btn-secondary" pending="Saving…">Shortlist</Submit></form>}
            {d.status !== "approved" && <form action={status.bind(null, "approved")}><Submit pending="Saving…" confirm="Approve this domain for purchase review? Nothing will be bought automatically.">Approve for purchase review</Submit></form>}
            {d.status !== "rejected" && <form action={status.bind(null, "rejected")}><Submit className="btn-danger" pending="Saving…">Reject</Submit></form>}
          </>
        )} />
      {d.status === "approved" && <div className="mb-6"><Notice tone="good">Approved for purchase review. Buy it yourself at a registrar after confirming the price and trademark position; the app never purchases domains.</Notice></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Score" description="Weighted from the facts below. Parts without data are left out and lower the confidence.">
            <div className="mb-4 flex items-baseline gap-3"><span className="text-4xl font-semibold tabular-nums">{d.score ?? "—"}</span><span className="text-sm text-muted">/ 100 · {d.confidence ?? 0}% confidence</span><Badge tone={scoreTone(d.score)}>{d.score == null ? "Unscored" : d.score >= 70 ? "Strong" : d.score >= 45 ? "Fair" : "Weak"}</Badge></div>
            <ScoreBreakdown components={(d.score_detail?.components ?? []) as Component[]} flags={d.score_detail?.flags ?? []} />
          </Card>

          <Card title="Cost & value" description={`All amounts in ${c.currency}. Values come only from sourced comparables.`}>
            <Dl items={[
              ["First-year price", d.price != null ? m(Number(d.price)) : "Not verified"],
              ["Renewal price", d.renewal_price != null ? m(Number(d.renewal_price)) : "Not verified"],
              ["Price source", d.price_source ? `${d.price_source}, ${when(d.price_checked_at)}` : "—"],
              ["Estimated 2-year cost", d.price != null ? m(Number(d.price) + Number(d.renewal_price ?? d.price)) : "Needs a verified price"],
              ["Valuation range", val ? `${m(val.low)} – ${m(val.high)} (median ${m(val.mid)}, ${val.n} comparable${val.n > 1 ? "s" : ""})` : "Insufficient evidence"],
              ["Share of domain budget", d.price != null && Number(c.domain_budget) > 0 ? `${((Number(d.price) / Number(c.domain_budget)) * 100).toFixed(1)}%` : "—"],
            ]} />
            {roi ? (
              <div className="mt-5 overflow-x-auto">
                <p className="mb-2 text-xs text-muted">Resale scenarios after {roi.years} years, against a holding cost of {m(roi.cost)}. Comparables are other names&apos; sales, not offers for this one.</p>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted"><tr><th className="py-1 font-medium">Scenario</th><th className="py-1 text-right font-medium">Sale price</th><th className="py-1 text-right font-medium">Profit</th><th className="py-1 text-right font-medium">ROI</th></tr></thead>
                  <tbody className="divide-y divide-line">{roi.rows.map((r) => (
                    <tr key={r.label}><td className="py-1.5">{r.label}</td><td className="py-1.5 text-right tabular-nums">{m(r.sale)}</td><td className="py-1.5 text-right tabular-nums">{m(r.profit)}</td><td className="py-1.5 text-right tabular-nums">{r.roi == null ? "—" : `${Math.round(r.roi * 100)}%`}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="mt-4 text-xs text-muted">ROI scenarios appear once a price is verified and at least one comparable sale is recorded.</p>}
          </Card>

          <Card title="Evidence" description="Every fact with its source and when it was observed.">
            <EvidenceList rows={ev as EvidenceRow[]} empty="No evidence yet. Check the registry or record a price." />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Registry">
            <Dl items={[["Status", REGISTRY_LABEL[d.registry_status]], ["Checked", when(d.registry_checked_at)]]} />
            {write && <form action={recheckDomain.bind(null, id, domainId)} className="mt-4"><Submit className="btn-secondary" pending="Checking…">Check again</Submit></form>}
          </Card>
          {write && <Card title="Record a price check" description="After checking a registrar or marketplace yourself."><PriceForm campaignId={id} domainId={domainId} currency={c.currency} /></Card>}
          {write && <Card title="Add a comparable sale" description="A sale of a similar name, with a link to where it's reported."><ComparableForm campaignId={id} domainId={domainId} currency={c.currency} /></Card>}
        </div>
      </div>
    </>
  );
}
