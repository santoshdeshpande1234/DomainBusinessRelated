import Link from "next/link";
import { CheckCircle2, Circle, Plus } from "lucide-react";
import { Badge, Card, Empty, LockedModule, PageHeader, STATUS_TONE, Stat } from "@/components/ui";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { MODULES, PROVIDERS } from "@/lib/options";
import { money, num, title, when } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const s = await getSession();
  const db = await userClient();
  const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [{ data: campaigns = [] }, { count: members }, { data: integrations = [] }, { data: ws }, { data: usage = [] }] = await Promise.all([
    db.from("campaigns").select("id, name, status, currency, domain_budget, prospect_budget, fx, updated_at").order("updated_at", { ascending: false }).limit(500),
    db.from("memberships").select("user_id", { count: "exact", head: true }).eq("status", "active"),
    db.from("integrations").select("provider"),
    db.from("workspaces").select("company_name, sender_name, monthly_api_budget_usd").eq("id", s.workspace.id).single(),
    db.from("api_usage").select("est_cost_usd").gte("created_at", start).limit(10000),
  ]);
  const live = campaigns!.filter((c) => c.status !== "archived");
  // Budgets in different currencies are added in USD using each campaign's saved exchange rate.
  const budgetUsd = live.reduce((t, c) => t + (Number(c.domain_budget) + Number(c.prospect_budget)) * Number(c.fx?.usd_per_unit ?? 0), 0);
  const spend = usage!.reduce((t, r) => t + Number(r.est_cost_usd ?? 0), 0);
  const phase2 = PROVIDERS.filter((p) => p.phase === 2).length;
  const connected2 = integrations!.filter((i) => PROVIDERS.find((p) => p.key === i.provider)?.phase === 2).length;
  const admin = can(s.role, "workspace:write");

  const setup: [boolean, string, string][] = [
    [!!(ws?.company_name && ws?.sender_name), "Add your company and sender name", "/settings"],
    [connected2 > 0, "Connect a Phase 2 data source", "/settings/integrations"],
    [(members ?? 0) > 1, "Invite a teammate", "/settings/team"],
    [campaigns!.length > 0, "Create your first campaign", "/campaigns/new"],
  ];
  const setupDone = setup.filter(([d]) => d).length;

  return (
    <>
      <PageHeader title={`Welcome${s.name ? `, ${s.name.split(" ")[0]}` : ""}`} description={s.workspace.name}
        actions={can(s.role, "campaign:write") && <Link href="/campaigns/new" className="btn-primary"><Plus className="size-4" />New campaign</Link>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Campaigns" value={num(live.length)} sub={`${num(live.filter((c) => c.status === "active").length)} active`} />
        <Stat label="Planned budget" value={money(budgetUsd, "USD", { maximumFractionDigits: 0 })} sub="Domains + research, excluding archived" />
        <Stat label="API spend this month" value={money(spend, "USD")} sub={ws?.monthly_api_budget_usd != null ? `of ${money(ws.monthly_api_budget_usd, "USD")}` : "No budget set"} />
        <Stat label="Data sources" value={`${connected2} / ${phase2}`} sub="Phase 2 providers connected" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Recent campaigns" actions={campaigns!.length > 0 && <Link href="/campaigns" className="text-xs font-medium text-accent hover:underline">View all</Link>}>
            {campaigns!.length === 0 ? (
              <Empty title="No campaigns yet">A campaign sets the industry, market, objectives and budgets that later phases work from.</Empty>
            ) : (
              <ul className="-my-3 divide-y divide-line">
                {campaigns!.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                    <Link href={`/campaigns/${c.id}`} className="min-w-0 truncate text-sm font-medium hover:text-accent">{c.name}</Link>
                    <span className="flex shrink-0 items-center gap-3"><span className="hidden text-xs text-faint sm:inline">{when(c.updated_at)}</span><Badge tone={STATUS_TONE[c.status]}>{title(c.status)}</Badge></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="What's coming" description="Each module unlocks in its phase and builds on your campaigns.">
            <div className="grid gap-2 sm:grid-cols-2">{MODULES.map((m) => <LockedModule key={m.key} label={m.label} phase={m.phase} text={m.text} />)}</div>
          </Card>
        </div>
        <Card title="Get set up" description={`${setupDone} of ${setup.length} done`}>
          <ul className="space-y-3">
            {setup.map(([done, label, href]) => (
              <li key={label} className="flex items-center gap-2.5 text-sm">
                {done ? <CheckCircle2 className="size-4 shrink-0 text-good" aria-label="Done" /> : <Circle className="size-4 shrink-0 text-faint" aria-label="To do" />}
                {done || (!admin && href.startsWith("/settings")) ? <span className={done ? "text-muted line-through" : ""}>{label}</span> : <Link href={href} className="hover:text-accent">{label}</Link>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
