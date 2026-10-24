import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Dl, PageHeader } from "@/components/ui";
import { Submit } from "@/components/submit";
import { EvidenceList, ScoreBreakdown, type EvidenceRow } from "@/components/evidence";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { when } from "@/lib/format";
import { opportunities, type Audit } from "@/lib/discovery/prospects";
import { PROSPECT_STATUS_TONE, scoreTone } from "@/lib/discovery/labels";
import type { Component } from "@/lib/discovery/domains";
import { ContactForm } from "../forms";
import { reauditProspect, setProspectStatus } from "../actions";

export const metadata = { title: "Prospect" };

const na = <span className="text-faint">Not available</span>;

export default async function ProspectPage({ params }: { params: Promise<{ id: string; prospectId: string }> }) {
  const { id, prospectId } = await params;
  const s = await getSession();
  const db = await userClient();
  const [{ data: p }, { data: c }, { data: ev = [] }, { count: comps }, { data: fm }, { data: web }, { data: prop }] = await Promise.all([
    db.from("prospects").select("*").eq("id", prospectId).eq("campaign_id", id).maybeSingle(),
    db.from("campaigns").select("name").eq("id", id).maybeSingle(),
    db.from("evidence").select("*").eq("prospect_id", prospectId).order("observed_at", { ascending: false }),
    db.from("competitors").select("id", { count: "exact", head: true }).eq("prospect_id", prospectId),
    db.from("financial_models").select("confidence").eq("prospect_id", prospectId).maybeSingle(),
    db.from("website_previews").select("status, share_enabled").eq("prospect_id", prospectId).maybeSingle(),
    db.from("proposals").select("status").eq("prospect_id", prospectId).maybeSingle(),
  ]);
  const steps: [string, string, string][] = [
    ["competitors", "Competitor analysis", comps ? `${comps} competitor(s)` : "Not started"],
    ["financials", "Financial opportunity", fm ? (fm.confidence != null ? `Calculated, ${fm.confidence}% confidence` : "Inputs needed") : "Not started"],
    ["website", "Website preview", web ? `${web.status}${web.share_enabled ? ", link shared" : ""}` : "Not started"],
    ["proposal", "Proposal and emails", prop ? prop.status : web ? "Ready to draft" : "Needs the website preview"],
  ];
  if (!p || !c) notFound();
  const write = can(s.role, "campaign:write");
  const a = p.audit as Audit | null;
  const opps = opportunities(a, !!p.website);
  const status = async (st: string) => { "use server"; await setProspectStatus(id, [prospectId], st); };

  return (
    <>
      <nav className="mb-3 text-sm text-muted"><Link href={`/campaigns/${id}`} className="hover:text-ink">{c.name}</Link> / <Link href={`/campaigns/${id}/prospects`} className="hover:text-ink">Prospects</Link> / </nav>
      <PageHeader title={p.name} description={<span className="flex flex-wrap items-center gap-2"><Badge tone={PROSPECT_STATUS_TONE[p.status]}>{p.status}</Badge>{p.category && <span>{p.category}</span>}</span>}
        actions={write && (
          <>
            {p.status !== "selected" && <form action={status.bind(null, "selected")}><Submit pending="Saving…">Select for proposals</Submit></form>}
            {p.status !== "new" && <form action={status.bind(null, "new")}><Submit className="btn-secondary" pending="Saving…">Reset</Submit></form>}
            {p.status !== "excluded" && <form action={status.bind(null, "excluded")}><Submit className="btn-danger" pending="Saving…">Exclude</Submit></form>}
          </>
        )} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Business">
            <Dl items={[
              ["Website", p.website ? <a href={p.website} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">{p.website.replace(/^https?:\/\//, "")}</a> : na],
              ["Phone", p.phone ?? na], ["Public email", p.email ?? na],
              ["Decision-maker", p.contact_name ? `${p.contact_name}${p.contact_role ? `, ${p.contact_role}` : ""}` : na],
              ["Address", p.address ?? na], ["City", [p.city, p.region, p.country].filter(Boolean).join(", ") || na],
              ["Found via", p.origin === "google_places" ? (p.origin_url ? <a href={p.origin_url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">Google Maps listing</a> : "Google Maps") : p.origin === "csv" ? "CSV import" : "Manual entry"],
              ["Added", when(p.created_at)],
            ]} />
          </Card>

          <Card title="Website check" description={p.audited_at ? `Home page checked ${when(p.audited_at)}. Observations only; nothing on the page is treated as instructions.` : "Not checked yet."}
            actions={write && p.website && <form action={reauditProspect.bind(null, id, prospectId)}><Submit className="btn-secondary py-1 text-xs" pending="Checking…">{p.audited_at ? "Check again" : "Check now"}</Submit></form>}>
            {!p.website ? <p className="text-sm text-muted">No website is listed for this business. That is itself an opportunity for a new site.</p>
              : !a ? <p className="text-sm text-muted">Run &quot;Check websites&quot; on the prospects page, or check this one now.</p>
              : a.error ? <p className="text-sm text-bad">Could not load the site: {a.error}</p>
              : (
                <div className="space-y-4">
                  <Dl items={[
                    ["Page title", a.title], ["Description", a.description ?? na],
                    ["Response", `HTTP ${a.status} in ${(a.ms / 1000).toFixed(1)} s, ${a.kb} KB`], ["HTTPS", a.https ? "Yes" : "No"],
                    ["Mobile viewport", a.viewport ? "Yes" : "No"], ["Forms on home page", String(a.forms)],
                    ["Online booking", a.booking ? "Found" : "Not found"], ["Calls to action", a.cta.length ? a.cta.join(", ") : "None found"],
                    ["Copyright year", a.copyright_year ? String(a.copyright_year) : "Not shown"], ["Built with", a.generator ?? "Not stated"],
                  ]} />
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted">Observed opportunities</p>
                    {opps.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{opps.map((o) => <li key={o}>{o}</li>)}</ul> : <p className="text-sm text-muted">None of the common issues were found on the home page.</p>}
                  </div>
                </div>
              )}
          </Card>

          <Card title="Evidence" description="Each fact with its source and the time it was observed."><EvidenceList rows={ev as EvidenceRow[]} empty="No evidence yet." /></Card>
        </div>

        <div className="space-y-6">
          <Card title="Opportunity work">
            <div className="space-y-2">{steps.map(([k, label, st]) => (
              <Link key={k} href={`/campaigns/${id}/prospects/${prospectId}/${k}`} className="card flex items-center justify-between gap-3 px-4 py-3 hover:border-accent">
                <span className="text-sm font-medium">{label}</span><span className="text-xs text-muted">{st}</span>
              </Link>
            ))}</div>
          </Card>
          <Card title="Score">
            <div className="mb-4 flex items-baseline gap-3"><span className="text-4xl font-semibold tabular-nums">{p.score ?? "—"}</span><span className="text-sm text-muted">/ 100 · {p.confidence ?? 0}% confidence</span><Badge tone={scoreTone(p.score)}>{p.score == null ? "Unscored" : p.score >= 70 ? "Strong" : p.score >= 45 ? "Fair" : "Weak"}</Badge></div>
            <ScoreBreakdown components={(p.score_detail?.components ?? []) as Component[]} flags={p.score_detail?.flags ?? []} />
          </Card>
          {write && <Card title="Research notes" description="Add a decision-maker or contact details you verified."><ContactForm campaignId={id} prospectId={prospectId} initial={{ contact_name: p.contact_name, contact_role: p.contact_role, email: p.email, phone: p.phone, notes: p.notes }} /></Card>}
        </div>
      </div>
    </>
  );
}
