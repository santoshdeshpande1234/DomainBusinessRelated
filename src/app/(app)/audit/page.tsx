import Link from "next/link";
import { redirect } from "next/navigation";
import { Empty, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { title, when } from "@/lib/format";

export const metadata = { title: "Audit log" };
const TYPES = ["all", "campaigns", "memberships", "invites", "integrations", "workspaces"] as const;
const PAGE = 50;

function describe(d: Record<string, unknown>) {
  const parts: string[] = [];
  if (d.name) parts.push(String(d.name));
  if (d.email) parts.push(String(d.email));
  if (d.from_status) parts.push(`${d.from_status} → ${d.status}`);
  else if (d.role) parts.push(`role ${d.role}`);
  if (Array.isArray(d.changed) && d.changed.length) parts.push(`changed ${d.changed.join(", ")}`);
  return parts.join(" · ");
}

export default async function Audit({ searchParams }: { searchParams: Promise<{ type?: string; page?: string }> }) {
  const sp = await searchParams;
  const s = await getSession();
  if (!can(s.role, "audit:read")) redirect("/");
  const type = TYPES.includes(sp.type as never) ? sp.type! : "all";
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const db = await userClient();
  let q = db.from("audit_logs").select("id, actor_email, action, resource_type, resource_id, detail, created_at")
    .order("id", { ascending: false }).range(page * PAGE, page * PAGE + PAGE);
  if (type !== "all") q = q.eq("resource_type", type);
  const { data = [] } = await q;
  const rows = data!.slice(0, PAGE);
  const href = (t: string, p = 0) => `/audit?type=${t}${p ? `&page=${p}` : ""}`;

  return (
    <>
      <PageHeader title="Audit log" description="Every change to campaigns, team, invites, integrations and settings. Written by the database, so it can't be edited from the app." />
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1 text-sm w-fit">
        {TYPES.map((t) => <Link key={t} href={href(t)} className={`rounded-md px-3 py-1 ${type === t ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink"}`}>{title(t)}</Link>)}
      </div>
      {rows.length === 0 ? <Empty title="Nothing recorded yet" /> : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-muted">{when(r.created_at)}</td>
                <td className="text-muted">{r.actor_email ?? "System"}</td>
                <td className="whitespace-nowrap font-mono text-xs">{r.action}</td>
                <td className="text-muted">{r.resource_type === "campaigns" && r.action !== "campaigns.delete"
                  ? <Link href={`/campaigns/${r.resource_id}`} className="hover:text-accent">{describe(r.detail as Record<string, unknown>)}</Link>
                  : describe(r.detail as Record<string, unknown>)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex justify-between">
        {page > 0 ? <Link href={href(type, page - 1)} className="btn-secondary">Newer</Link> : <span />}
        {data!.length > PAGE && <Link href={href(type, page + 1)} className="btn-secondary">Older</Link>}
      </div>
    </>
  );
}
