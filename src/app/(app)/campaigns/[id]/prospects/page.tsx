import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Card, Empty, Notice, PageHeader, Stat } from "@/components/ui";
import { RunButton } from "@/components/run-button";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { money, num } from "@/lib/format";
import { opportunities, type Audit } from "@/lib/discovery/prospects";
import { searchTerms } from "@/lib/discovery/keywords";
import { campaignSpendUsd } from "@/lib/discovery/net";
import { prospectBudgetUsd } from "@/lib/discovery/service";
import type { Campaign } from "@/lib/types";
import { ProspectTable, type ProspectRow } from "./prospect-table";
import { ImportForm } from "./forms";
import { auditProspects, searchProspects, setProspectStatus } from "./actions";

export const metadata = { title: "Prospect research" };

export default async function ProspectsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  const db = await userClient();
  const [{ data: c }, { data: rows = [] }, { data: places }] = await Promise.all([
    db.from("campaigns").select("*").eq("id", id).maybeSingle(),
    db.from("prospects").select("id, name, city, website, phone, email, contact_name, origin, audited_at, audit, score, confidence, status")
      .eq("campaign_id", id).order("score", { ascending: false, nullsFirst: false }).order("name").limit(1000),
    db.from("integrations").select("provider").eq("provider", "google_places").maybeSingle(),
  ]);
  if (!c) notFound();
  const camp = c as Campaign;
  const write = can(s.role, "campaign:write");
  const list: ProspectRow[] = rows!.map(({ audit, ...r }) => ({ ...r, opportunities: opportunities(audit as Audit | null, !!r.website).length }));
  const toAudit = list.filter((r) => r.website && !r.audited_at && r.status !== "excluded").length;
  const qualified = list.filter((r) => (r.score ?? 0) >= camp.min_quality_score && r.status !== "excluded").length;
  const budget = prospectBudgetUsd(camp);
  const spent = await campaignSpendUsd(id);
  const st = (camp.progress?.places ?? null) as { term: number; done: boolean } | null;
  const terms = searchTerms(camp.industry, camp.custom_industry);

  return (
    <>
      <nav className="mb-3 text-sm text-muted"><Link href="/campaigns" className="hover:text-ink">Campaigns</Link> / <Link href={`/campaigns/${id}`} className="hover:text-ink">{camp.name}</Link> / </nav>
      <PageHeader title="Prospect research" description="Real businesses from Google Maps or your own lists, with every fact kept alongside its source."
        actions={<>
          {write && places && <RunButton run={searchProspects.bind(null, id)} loop className="btn-primary" disabled={st?.done}>{st ? "Find more businesses" : "Find businesses"}</RunButton>}
          {write && list.some((r) => r.website) && <RunButton run={auditProspects.bind(null, id)} loop disabled={toAudit === 0}>Check websites ({toAudit})</RunButton>}
          {list.length > 0 && <a href={`/campaigns/${id}/prospects/export`} className="btn-ghost"><Download className="size-4" />Export CSV</a>}
        </>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Prospects" value={num(list.length)} sub={`Limit ${num(camp.max_prospects)}`} />
        <Stat label="Qualified" value={num(qualified)} sub={`Score ${camp.min_quality_score}+ (campaign minimum)`} />
        <Stat label="Selected" value={num(list.filter((r) => r.status === "selected").length)} sub="For proposals in later phases" />
        <Stat label="Research spend" value={money(spent, "USD")} sub={`of ${money(budget, "USD")} budget (list prices, before Google's free allowance)`} />
      </div>

      {!places && write && <div className="mb-6"><Notice>Connect Google Places in <Link href="/settings/integrations" className="font-medium underline">Integrations</Link> to search for businesses, or import a CSV below.</Notice></div>}
      {st && <p className="mb-4 text-xs text-muted">Searched {st.done ? "all" : `${st.term + 1} of`} {terms.length} search terms: {terms.join(", ")}.</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Card title="Prospects">
            {list.length === 0
              ? <Empty title="No prospects yet">{write ? "Find businesses with Google Places or import a CSV of companies you're allowed to contact." : "A member hasn't added prospects yet."}</Empty>
              : <ProspectTable campaignId={id} rows={list} write={write} minScore={camp.min_quality_score} setStatus={setProspectStatus.bind(null, id)} />}
          </Card>
        </div>
        {write && <Card title="Import a CSV" description="Duplicates (same website, or same name and city) are skipped."><ImportForm campaignId={id} /></Card>}
      </div>
    </>
  );
}
