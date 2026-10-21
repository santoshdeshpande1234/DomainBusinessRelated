import { Badge, Card, PageHeader } from "@/components/ui";
import { Submit } from "@/components/submit";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { title, when } from "@/lib/format";
import { revokeInvite } from "./actions";
import { InviteForm, MemberControls } from "./forms";

export const metadata = { title: "Team" };

const ROLE_HELP: [string, string][] = [
  ["Admin", "Everything, including settings, team, integrations and the audit log."],
  ["Member", "Create and edit campaigns."],
  ["Viewer", "Read-only access."],
];

export default async function Team() {
  const s = await getSession();
  const admin = can(s.role, "team:manage");
  const db = await userClient();
  const [{ data: members = [] }, { data: invites = [] }] = await Promise.all([
    db.from("memberships").select("user_id, email, full_name, role, status, created_at").order("created_at"),
    admin ? db.from("invites").select("id, email, role, created_at, expires_at").eq("status", "pending").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  return (
    <>
      <PageHeader title="Team" description="People in this workspace. Access is by invitation only." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {admin && <Card title="Invite someone" description="They get an email link to join. Invites expire after 7 days."><InviteForm /></Card>}
          <Card title={`Members (${members!.length})`}>
            <ul className="-my-3 divide-y divide-line">
              {members!.map((m) => (
                <li key={m.user_id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.full_name || m.email}{m.user_id === s.userId && <span className="ml-1 text-xs font-normal text-faint">(you)</span>}</p>
                    <p className="truncate text-xs text-muted">{m.email} · joined {when(m.created_at)}</p>
                  </div>
                  {admin
                    ? <MemberControls userId={m.user_id} role={m.role} status={m.status} self={m.user_id === s.userId} />
                    : <span className="flex gap-1"><Badge tone="accent">{title(m.role)}</Badge>{m.status !== "active" && <Badge tone="warn">Disabled</Badge>}</span>}
                </li>
              ))}
            </ul>
          </Card>
          {admin && invites!.length > 0 && (
            <Card title="Pending invites">
              <ul className="-my-3 divide-y divide-line">
                {invites!.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0"><p className="truncate text-sm">{i.email} <Badge>{title(i.role)}</Badge></p><p className="text-xs text-muted">Expires {when(i.expires_at)}</p></div>
                    <form action={revokeInvite.bind(null, i.id)}><Submit className="btn-ghost text-xs" pending="Revoking…">Revoke</Submit></form>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <Card title="Roles">
          <dl className="space-y-3">{ROLE_HELP.map(([r, d]) => <div key={r}><dt className="text-sm font-medium">{r}</dt><dd className="text-xs text-muted">{d}</dd></div>)}</dl>
        </Card>
      </div>
    </>
  );
}
