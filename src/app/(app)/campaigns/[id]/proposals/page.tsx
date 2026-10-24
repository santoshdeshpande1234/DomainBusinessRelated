import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Empty, PageHeader, type Tone } from "@/components/ui";
import { RunButton } from "@/components/run-button";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { money, when } from "@/lib/format";
import type { Proposal, ProposalCheck } from "@/lib/proposals/proposal";
import { draftNextProposal } from "./actions";

export const metadata = { title: "Proposals" };
const TONE: Record<string, Tone> = { draft: "neutral", ready: "good", archived: "neutral" };

export default async function ProposalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  const db = await userClient();
  const [{ data: c }, { data: ps = [] }, { data: webs = [] }, { data: props = [] }] = await Promise.all([
    db.from("campaigns").select("name, currency").eq("id", id).maybeSingle(),
    db.from("prospects").select("id, name, category").eq("campaign_id", id).eq("status", "selected").order("score", { ascending: false, nullsFirst: false }),
    db.from("website_previews").select("prospect_id, status, share_enabled, content").eq("campaign_id", id),
    db.from("proposals").select("prospect_id, status, content, checks, updated_at").eq("campaign_id", id),
  ]);
  if (!c) notFound();
  const write = can(s.role, "campaign:write");
  const todo = ps!.filter((p) => webs!.some((w) => w.prospect_id === p.id && w.content?.growth) && !props!.some((x) => x.prospect_id === p.id)).length;

  return (
    <>
      <nav className="mb-3 text-sm text-muted"><Link href="/campaigns" className="hover:text-ink">Campaigns</Link> / <Link href={`/campaigns/${id}`} className="hover:text-ink">{c.name}</Link> / </nav>
      <PageHeader title="Proposals & PDF" description="A consulting-quality proposal and three email drafts for each selected prospect, built from its saved research. Download as PDF; nothing is sent from here."
        actions={write && todo > 0 && <RunButton run={draftNextProposal.bind(null, id)} loop className="btn-primary">Draft {todo} missing proposal{todo === 1 ? "" : "s"}</RunButton>} />
      <Card>
        {ps!.length === 0 ? (
          <Empty title="No prospects selected yet" action={<Link href={`/campaigns/${id}/prospects`} className="btn-primary">Open prospect research</Link>}>Select the businesses you want to pitch, generate their website previews, then draft proposals here.</Empty>
        ) : (
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-faint">
                <th className="px-5 py-3 font-medium">Prospect</th><th className="px-3 py-3 font-medium">Website preview</th><th className="px-3 py-3 font-medium">Proposal</th>
                <th className="px-3 py-3 font-medium">First year</th><th className="px-5 py-3 font-medium">To do</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {ps!.map((p) => {
                  const w = webs!.find((x) => x.prospect_id === p.id);
                  const pr = props!.find((x) => x.prospect_id === p.id);
                  const content = pr?.content as Proposal | undefined;
                  const checks = pr?.checks as ProposalCheck | undefined;
                  const base = `/campaigns/${id}/prospects/${p.id}`;
                  return (
                    <tr key={p.id}>
                      <td className="px-5 py-3"><Link href={`${base}/proposal`} className="font-medium hover:text-accent">{p.name}</Link>{p.category && <span className="block text-xs text-faint">{p.category}</span>}</td>
                      <td className="px-3 py-3"><Link href={`${base}/website`} className="hover:text-accent">{!w ? "Not started" : !w.content?.growth ? "No growth plan yet" : <span className="flex gap-1.5"><Badge tone={TONE[w.status]}>{w.status}</Badge>{w.share_enabled && <Badge tone="accent">shared</Badge>}</span>}</Link></td>
                      <td className="px-3 py-3"><Link href={`${base}/proposal`} className="hover:text-accent">{pr ? <><Badge tone={TONE[pr.status]}>{pr.status}</Badge><span className="block text-xs text-faint">{when(pr.updated_at)}</span></> : w?.content?.growth ? "Ready to draft" : "—"}</Link></td>
                      <td className="px-3 py-3 tabular-nums">{content?.investment?.first_year != null ? money(content.investment.first_year, c.currency, { maximumFractionDigits: 0 }) : pr ? "Prices to confirm" : "—"}</td>
                      <td className="px-5 py-3 text-xs text-muted">{checks?.missing?.length ? `${checks.missing.length} item(s) to fill` : pr ? (pr.status === "ready" ? "Ready to send" : "Review and mark ready") : !w?.content?.growth ? "Generate the website preview" : "Draft the proposal"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
