import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { Badge, Card, Dl, LockedModule, Notice, PageHeader, STATUS_TONE } from "@/components/ui";
import { Submit } from "@/components/submit";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { INDUSTRIES, LIVE_PHASE, MODULES, OBJECTIVES, labelOf } from "@/lib/options";
import { money, num, title, when } from "@/lib/format";
import type { Campaign } from "@/lib/types";
import { deleteCampaign, setCampaignStatus } from "../actions";

const NEXT_STATUS: Record<Campaign["status"], [string, string][]> = {
  draft: [["active", "Activate"], ["archived", "Archive"]],
  active: [["paused", "Pause"], ["archived", "Archive"]],
  paused: [["active", "Resume"], ["archived", "Archive"]],
  archived: [["draft", "Restore to draft"]],
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await userClient();
  const { data } = await db.from("campaigns").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Campaign" };
}

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const s = await getSession();
  const db = await userClient();
  const { data } = await db.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const c = data as Campaign;
  const n = (table: string) => db.from(table).select("id", { count: "exact", head: true }).eq("campaign_id", id);
  const [{ count: domains }, { count: prospects }, { count: selected }, { count: competitors }, { count: models }, { count: previews }, { count: proposals }] = await Promise.all([
    n("domains"), n("prospects"), n("prospects").eq("status", "selected"), n("competitors"), n("financial_models"), n("website_previews"), n("proposals"),
  ]);
  const counts: Record<string, string> = { domains: `${domains ?? 0} domain${domains === 1 ? "" : "s"}`, prospects: `${prospects ?? 0} prospect${prospects === 1 ? "" : "s"}, ${selected ?? 0} selected`,
    competitors: `${competitors ?? 0} competitor${competitors === 1 ? "" : "s"} tracked`, financials: `${models ?? 0} model${models === 1 ? "" : "s"}`,
    studio: `${previews ?? 0} preview${previews === 1 ? "" : "s"}`, proposals: `${proposals ?? 0} proposal${proposals === 1 ? "" : "s"}` };
  const { data: author } = c.created_by
    ? await db.from("memberships").select("full_name, email").eq("user_id", c.created_by).maybeSingle()
    : { data: null };
  const write = can(s.role, "campaign:write");
  const p = c.service_pricing ?? {};
  const usd = (n: number) => money(n * c.fx.usd_per_unit, "USD", { maximumFractionDigits: 0 });

  return (
    <>
      <nav className="mb-3 text-sm text-muted"><Link href="/campaigns" className="hover:text-ink">Campaigns</Link> / </nav>
      <PageHeader
        title={c.name}
        description={<span className="flex flex-wrap items-center gap-2"><Badge tone={STATUS_TONE[c.status]}>{title(c.status)}</Badge>
          {c.industry === "custom" ? c.custom_industry : labelOf(INDUSTRIES, c.industry)} · {[c.city, c.region, c.country].filter(Boolean).join(", ")}</span>}
        actions={write && (
          <>
            {NEXT_STATUS[c.status].map(([st, label]) => (
              <form key={st} action={setCampaignStatus.bind(null, c.id)}>
                <input type="hidden" name="status" value={st} />
                <Submit className={st === "active" ? "btn-primary" : "btn-secondary"} pending="Saving…">{label}</Submit>
              </form>
            ))}
            <Link href={`/campaigns/${c.id}/edit`} className="btn-secondary">Edit</Link>
          </>
        )}
      />
      {sp.created && <div className="mb-6"><Notice tone="good">Campaign created as a draft. Next, open Domain discovery or Prospect research below.</Notice></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Market">
            <Dl items={[
              ["Country", c.country], ["State or region", c.region], ["City", c.city], ["Service area", c.service_area],
              ["Language", c.language], ["Currency", c.currency],
            ]} />
          </Card>
          <Card title="Objectives">
            <ul className="flex flex-wrap gap-2">{c.objectives.map((o) => <li key={o}><Badge tone="accent">{labelOf(OBJECTIVES, o)}</Badge></li>)}</ul>
          </Card>
          <Card title="Budget & targets" description={`USD equivalents use 1 ${c.currency} = ${c.fx.usd_per_unit} USD from ${c.fx.provider}, saved ${when(c.fx.fetched_at)}.`}>
            <Dl items={[
              ["Domain budget", <>{money(c.domain_budget, c.currency)}{c.currency !== "USD" && <span className="text-faint"> ≈ {usd(c.domain_budget)}</span>}</>],
              ["Prospect research budget", <>{money(c.prospect_budget, c.currency)}{c.currency !== "USD" && <span className="text-faint"> ≈ {usd(c.prospect_budget)}</span>}</>],
              ["Maximum prospects", num(c.max_prospects)],
              ["Minimum quality score", `${c.min_quality_score} / 100`],
              ["Extensions", c.extensions.join("  ")],
              ["Max domains to shortlist", num(c.limits?.max_domains)],
              ["Daily email limit", num(c.limits?.daily_email_limit)],
              ["Max API spend", c.limits?.max_api_spend_usd != null ? money(c.limits.max_api_spend_usd, "USD") : "—"],
            ]} />
          </Card>
          <Card title="Service pricing">
            <Dl items={[
              ["New website", p.website_build != null ? money(p.website_build, c.currency) : "Not set"],
              ["Website redesign", p.website_redesign != null ? money(p.website_redesign, c.currency) : "Not set"],
              ["Monthly retainer", p.monthly_retainer != null ? money(p.monthly_retainer, c.currency) : "Not set"],
            ]} />
          </Card>
          {c.notes && <Card title="Notes"><p className="whitespace-pre-wrap text-sm">{c.notes}</p></Card>}
        </div>

        <div className="space-y-6">
          <Card title="Pipeline" description="Open a stage to work on it. Later stages unlock as they ship.">
            <div className="space-y-2">{MODULES.map((m) => m.phase <= LIVE_PHASE ? (
              <Link key={m.key} href={`/campaigns/${c.id}/${m.key}`} className="card flex items-center justify-between gap-3 px-4 py-3.5 hover:border-accent">
                <span><span className="block text-sm font-medium">{m.label}</span><span className="block text-xs text-muted">{counts[m.key]}</span></span>
                <ArrowRight className="size-4 text-faint" aria-hidden />
              </Link>
            ) : <LockedModule key={m.key} label={m.label} phase={m.phase} text={m.text} />)}</div>
          </Card>
          <Card title="Details">
            <Dl items={[["Created by", author?.full_name || author?.email || "—"], ["Created", when(c.created_at)], ["Last updated", when(c.updated_at)]]} />
          </Card>
          {can(s.role, "campaign:delete") && (
            <Card title="Danger zone">
              <p className="mb-3 text-sm text-muted">Deleting removes this campaign permanently. The audit log keeps a record.</p>
              <form action={deleteCampaign.bind(null, c.id)}>
                <Submit className="btn-danger" pending="Deleting…" confirm={`Delete "${c.name}" permanently?`}>Delete campaign</Submit>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
