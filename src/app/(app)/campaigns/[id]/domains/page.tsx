import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Empty, Notice, PageHeader, Stat } from "@/components/ui";
import { RunButton } from "@/components/run-button";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { money, num } from "@/lib/format";
import { DomainTable, type DomainRow } from "./domain-table";
import { AddDomainsForm } from "./forms";
import { checkDomains, generateDomains, setDomainStatus } from "./actions";

export const metadata = { title: "Domain discovery" };

export default async function DomainsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  const db = await userClient();
  const [{ data: c }, { data: rows = [] }] = await Promise.all([
    db.from("campaigns").select("id, name, currency, domain_budget, extensions, limits").eq("id", id).maybeSingle(),
    db.from("domains").select("id, name, registry_status, price, price_currency, score, confidence, status, origin")
      .eq("campaign_id", id).order("score", { ascending: false, nullsFirst: false }).order("name").limit(1000),
  ]);
  if (!c) notFound();
  const write = can(s.role, "campaign:write");
  const list = rows as DomainRow[];
  const unchecked = list.filter((r) => r.registry_status === "unchecked" && r.status !== "rejected").length;
  const free = list.filter((r) => r.registry_status === "unregistered").length;
  const short = list.filter((r) => r.status === "shortlisted" || r.status === "approved").length;

  return (
    <>
      <nav className="mb-3 text-sm text-muted"><Link href="/campaigns" className="hover:text-ink">Campaigns</Link> / <Link href={`/campaigns/${id}`} className="hover:text-ink">{c.name}</Link> / </nav>
      <PageHeader title="Domain discovery" description="Ideas from your campaign's industry, location and extensions, checked against the official registries. Nothing is ever bought from here."
        actions={write && (
          <>
            <RunButton run={generateDomains.bind(null, id)}>Generate ideas</RunButton>
            {list.length > 0 && <RunButton run={checkDomains.bind(null, id)} loop className="btn-primary" disabled={unchecked === 0}>Check registry ({unchecked})</RunButton>}
          </>
        )} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Domains" value={num(list.length)} sub={`${num(unchecked)} not checked yet`} />
        <Stat label="No registry record" value={num(free)} sub="May be registrable; confirm at a registrar" />
        <Stat label="Shortlisted" value={num(short)} sub={c.limits?.max_domains ? `Limit ${c.limits.max_domains}` : "No limit set"} />
        <Stat label="Domain budget" value={money(Number(c.domain_budget), c.currency, { maximumFractionDigits: 0 })} sub={c.extensions.join(" ")} />
      </div>

      <div className="mb-6"><Notice tone="neutral">
        &quot;No registry record&quot; comes from RDAP, the registries&apos; public lookup. It means nobody owns the name today, but premium or reserved names can still be unavailable, so prices and availability are confirmed only by a registrar or by your manual check. Comparable sales are added by hand with their source.
      </Notice></div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Card title="Candidates">
            {list.length === 0
              ? <Empty title="No domains yet">{write ? "Generate ideas from the campaign settings, or add names you already have in mind." : "A member hasn't added domains yet."}</Empty>
              : <DomainTable campaignId={id} rows={list} write={write} setStatus={setDomainStatus.bind(null, id)} />}
          </Card>
        </div>
        {write && <Card title="Add your own" description="Paste names separated by spaces, commas or new lines."><AddDomainsForm campaignId={id} /></Card>}
      </div>
    </>
  );
}
