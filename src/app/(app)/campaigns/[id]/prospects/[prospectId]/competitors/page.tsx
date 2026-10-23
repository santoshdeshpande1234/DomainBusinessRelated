import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Minus, X } from "lucide-react";
import { Badge, Card, Empty, Notice, PageHeader } from "@/components/ui";
import { Submit } from "@/components/submit";
import { RunButton } from "@/components/run-button";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { when } from "@/lib/format";
import type { Audit } from "@/lib/discovery/prospects";
import { analyse, featureMatrix, type Insight, type Side } from "@/lib/studio/competitors";
import { PLACES_COST_PER_REQUEST_USD } from "@/lib/discovery/places";
import { assessAdvantage } from "@/lib/studio/advantage";
import type { Inventory } from "@/lib/studio/inventory";
import { CompetitivePosition } from "@/components/competitive-position";
import { auditCompetitors, competitorsFromCampaign, competitorsFromPlaces, recheckCompetitors, removeCompetitor } from "./actions";
import { AddCompetitorForm } from "./form";

export const metadata = { title: "Competitor analysis" };

const ORIGIN: Record<string, string> = { campaign: "From this campaign", google_places: "Google Maps", manual: "Added by hand" };

function Mark({ v }: { v: boolean | null }) {
  if (v == null) return <span title="Not checked"><Minus className="mx-auto size-4 text-faint" aria-label="Not checked" /></span>;
  return v ? <span title="Yes"><Check className="mx-auto size-4 text-good" aria-label="Yes" /></span> : <span title="No"><X className="mx-auto size-4 text-bad" aria-label="No" /></span>;
}

function Insights({ title, items, empty }: { title: string; items: Insight[]; empty: string }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">{title}</h3>
      {items.length ? (
        <ul className="space-y-1.5 text-sm">
          {items.map((i) => <li key={i.text} className="flex gap-2"><Badge tone={i.kind === "fact" ? "good" : "warn"}>{i.kind === "fact" ? "Observed" : "Assumption"}</Badge><span>{i.text}</span></li>)}
        </ul>
      ) : <p className="text-sm text-muted">{empty}</p>}
    </div>
  );
}

export default async function CompetitorsPage({ params }: { params: Promise<{ id: string; prospectId: string }> }) {
  const { id, prospectId } = await params;
  const s = await getSession();
  const db = await userClient();
  const [{ data: p }, { data: c }, { data: list = [] }, { data: vis }, { data: invRow }] = await Promise.all([
    db.from("prospects").select("*").eq("id", prospectId).eq("campaign_id", id).maybeSingle(),
    db.from("campaigns").select("name, industry").eq("id", id).maybeSingle(),
    db.from("competitors").select("*").eq("prospect_id", prospectId).order("created_at"),
    db.from("evidence").select("value, observed_at, source_url").eq("prospect_id", prospectId).eq("kind", "visibility").order("observed_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("site_inventories").select("inventory").eq("prospect_id", prospectId).maybeSingle(),
  ]);
  if (!p || !c) notFound();
  const write = can(s.role, "campaign:write");
  const me: Side = { name: p.name, audit: p.audit as Audit | null, reviews: p.score_detail?.reviews ?? null, rating: p.score_detail?.rating ?? null, hasWebsite: !!p.website };
  const sides: Side[] = list!.map((x) => ({ name: x.name, audit: x.audit as Audit | null, reviews: x.reviews, rating: x.rating == null ? null : Number(x.rating), hasWebsite: !!x.website }));
  const matrix = featureMatrix(me, sides);
  const a = analyse(me, sides);
  const inv = (invRow?.inventory as Inventory | undefined)?.pages ? (invRow!.inventory as Inventory) : null;
  const position = assessAdvantage({ name: p.name, industry: c.industry, prospect: me, competitors: sides,
    site: inv ? { servicePages: inv.pages.filter((x) => x.status === "extracted" && (x.kind === "service" || x.kind === "product")).length, prices: inv.pages.some((x) => x.prices.length > 0) } : null });
  const unchecked = list!.filter((x) => x.website && !x.audited_at).length + (p.website && !p.audited_at ? 1 : 0);
  const base = `/campaigns/${id}/prospects/${prospectId}`;

  return (
    <>
      <nav className="mb-3 text-sm text-muted"><Link href={`/campaigns/${id}/prospects`} className="hover:text-ink">{c.name}</Link> / <Link href={base} className="hover:text-ink">{p.name}</Link> / </nav>
      <PageHeader title="Competitor analysis" description={`How ${p.name}'s website compares with nearby businesses in the same line of work. Only what was observed on their home pages and public listings.`}
        actions={write && (
          <>
            <RunButton run={competitorsFromCampaign.bind(null, id, prospectId)}>Use businesses from this campaign</RunButton>
            <RunButton run={competitorsFromPlaces.bind(null, id, prospectId)} confirm={`Search Google Maps for competitors? About $${PLACES_COST_PER_REQUEST_USD.toFixed(3)} unless cached, counted against this campaign's budget.`}>Search Google Maps</RunButton>
            {list!.length > 0 && <RunButton run={auditCompetitors.bind(null, id, prospectId)} loop className="btn-primary" disabled={unchecked === 0}>Check websites ({unchecked})</RunButton>}
          </>
        )} />

      {list!.length === 0 ? (
        <Card><Empty title="No competitors yet">{write ? "Start with businesses this campaign already found (free), search Google Maps, or add one you know." : "A member hasn't added competitors yet."}</Empty></Card>
      ) : (
        <div className="space-y-6">
          <CompetitivePosition a={position} />
          <Card title="Website features" description={`${a.compared} of ${list!.length} competitor websites checked. A dash means not checked or not loadable.`}
            actions={write && <form action={recheckCompetitors.bind(null, id, prospectId)}><Submit className="btn-ghost py-1 text-xs" pending="…">Mark all for re-check</Submit></form>}>
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-faint">
                    <th className="py-2 pr-3 font-medium">Feature</th>
                    <th className="px-2 py-2 text-center font-semibold text-ink">{p.name}</th>
                    {list!.map((x) => <th key={x.id} className="max-w-32 px-2 py-2 text-center font-medium"><span className="line-clamp-2">{x.name}</span></th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {matrix.map((r) => (
                    <tr key={r.key}>
                      <td className="py-2 pr-3">{r.label}</td>
                      <td className="bg-accent-soft/50 px-2 py-2"><Mark v={r.prospect} /></td>
                      {r.competitors.map((v, i) => <td key={i} className="px-2 py-2"><Mark v={v} /></td>)}
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 pr-3">Public reviews (Google)</td>
                    <td className="bg-accent-soft/50 px-2 py-2 text-center tabular-nums">{me.reviews ?? "—"}</td>
                    {list!.map((x) => <td key={x.id} className="px-2 py-2 text-center tabular-nums">{x.reviews ?? "—"}</td>)}
                  </tr>
                  <tr>
                    <td className="py-2 pr-3">Positioning (page title)</td>
                    <td className="bg-accent-soft/50 px-2 py-2 text-xs text-muted">{me.audit?.title ?? "—"}</td>
                    {list!.map((x) => <td key={x.id} className="px-2 py-2 text-xs text-muted">{(x.audit as Audit | null)?.title ?? "—"}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
            {vis && <p className="mt-3 text-xs text-muted">Search visibility: {vis.value} (seen {when(vis.observed_at)}).</p>}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="What the comparison shows" description="Observed facts are from the checks above; assumptions are our reading of them.">
              <div className="space-y-5">
                <Insights title="Current strengths" items={a.strengths} empty="No feature where this business is ahead of most competitors." />
                <Insights title="Competitor advantages" items={a.advantages} empty="Competitors have no common feature this business lacks." />
                <Insights title="Unserved customer needs" items={a.unserved} empty="Every checked feature is offered by at least one business here." />
                <Insights title="Differentiation opportunities" items={a.differentiation} empty="None found among the features checked." />
              </div>
            </Card>
            <Card title="Recommended improvements" description="Ordered by how many competitors already offer each one. Impact is measured, not promised.">
              {a.recommendations.length ? (
                <ol className="space-y-3 text-sm">
                  {a.recommendations.map((r, i) => (
                    <li key={r.text} className="flex gap-3">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{i + 1}</span>
                      <div><p className="font-medium">{r.text}</p><p className="text-muted">{r.why}</p><p className="mt-0.5 text-xs text-faint">Measure with: {r.measure}</p></div>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-sm text-muted">{me.audit ? "No gaps found in the features checked." : "Check this business's website to see recommendations."}</p>}
              <p className="mt-4 text-xs text-muted">Turn these into numbers in the <Link href={`${base}/financials`} className="text-accent hover:underline">financial model</Link> as traffic or conversion changes.</p>
            </Card>
          </div>

          <Card title="Sources">
            <ul className="-my-2 divide-y divide-line text-sm">
              {list!.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{x.name}</span>
                    {x.website && <> · <a href={x.website} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">{x.website_host}</a></>}
                    <span className="block text-xs text-faint">
                      {ORIGIN[x.origin]}{x.detail?.rank ? `, position ${x.detail.rank} for "${x.detail.query}"` : ""}{x.detail?.reason ? ` (${x.detail.reason})` : ""}
                      {x.origin_url && <> · <a href={x.origin_url} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">source</a></>}
                      {" · "}{x.audited_at ? `website checked ${when(x.audited_at)}` : x.website ? "website not checked" : "no website listed"}
                    </span>
                  </span>
                  {write && <form action={removeCompetitor.bind(null, id, prospectId, x.id)}><Submit className="btn-ghost py-1 text-xs" pending="…">Remove</Submit></form>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {write && (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card title="Add a competitor" description="One you know of, with where you found it."><AddCompetitorForm campaignId={id} prospectId={prospectId} /></Card>
          <div className="lg:col-span-2"><Notice tone="neutral">Competitor websites are read as data only: text on them is never followed as instructions. Comparisons cover the home page, so a feature on another page may be missed; check before quoting a gap to the business.</Notice></div>
        </div>
      )}
    </>
  );
}
