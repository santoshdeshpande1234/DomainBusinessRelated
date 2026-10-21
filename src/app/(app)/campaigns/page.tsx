import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge, Empty, Notice, PageHeader, STATUS_TONE } from "@/components/ui";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { INDUSTRIES, labelOf } from "@/lib/options";
import { money, title, when } from "@/lib/format";

export const metadata = { title: "Campaigns" };
const FILTERS = ["all", "draft", "active", "paused", "archived"] as const;

export default async function Campaigns({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; deleted?: string }> }) {
  const sp = await searchParams;
  const s = await getSession();
  const status = FILTERS.includes(sp.status as never) ? sp.status! : "all";
  const q = (sp.q ?? "").trim().slice(0, 80);
  const db = await userClient();
  let query = db.from("campaigns").select("id, name, industry, custom_industry, city, country, currency, domain_budget, status, updated_at")
    .order("updated_at", { ascending: false }).limit(200);
  if (status !== "all") query = query.eq("status", status);
  if (q) query = query.ilike("name", `%${q.replace(/[%_\\]/g, "\\$&")}%`);
  const { data: rows = [] } = await query;
  const write = can(s.role, "campaign:write");
  const newBtn = write && <Link href="/campaigns/new" className="btn-primary"><Plus className="size-4" />New campaign</Link>;

  return (
    <>
      <PageHeader title="Campaigns" description="Each campaign targets one industry in one market." actions={newBtn} />
      {sp.deleted && <div className="mb-4"><Notice tone="good">Campaign deleted.</Notice></div>}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1 text-sm">
          {FILTERS.map((f) => (
            <Link key={f} href={`/campaigns?status=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-md px-3 py-1 ${status === f ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink"}`}>{title(f)}</Link>
          ))}
        </div>
        <form className="w-full sm:w-64"><input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={q} placeholder="Search by name" className="input" aria-label="Search campaigns" /></form>
      </div>
      {rows!.length === 0 ? (
        <Empty title={q || status !== "all" ? "No campaigns match" : "No campaigns yet"} action={!q && status === "all" ? newBtn : undefined}>
          {q || status !== "all" ? "Try another filter." : write ? "Create your first campaign to set the market, objectives and budgets." : "Campaigns your team creates will appear here."}
        </Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Name</th><th>Industry</th><th>Location</th><th className="text-right">Domain budget</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>
              {rows!.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2">
                  <td><Link href={`/campaigns/${c.id}`} className="font-medium hover:text-accent">{c.name}</Link></td>
                  <td className="text-muted">{c.industry === "custom" ? c.custom_industry : labelOf(INDUSTRIES, c.industry)}</td>
                  <td className="text-muted">{[c.city, c.country].filter(Boolean).join(", ")}</td>
                  <td className="text-right tabular-nums">{money(c.domain_budget, c.currency, { maximumFractionDigits: 0 })}</td>
                  <td><Badge tone={STATUS_TONE[c.status]}>{title(c.status)}</Badge></td>
                  <td className="whitespace-nowrap text-muted">{when(c.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
