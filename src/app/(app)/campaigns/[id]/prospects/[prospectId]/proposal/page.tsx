import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Empty, Notice, PageHeader, type Tone } from "@/components/ui";
import { RunButton } from "@/components/run-button";
import { ProposalDocument } from "@/components/proposal-document";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { when } from "@/lib/format";
import type { EmailDraft, Proposal, ProposalCheck } from "@/lib/proposals/proposal";
import { generateProposal, setProposalStatus } from "./actions";
import { EmailDrafts, ProposalEditor, RestoreButton } from "./editor";

export const metadata = { title: "Proposal" };
const TONE: Record<string, Tone> = { draft: "neutral", ready: "good", archived: "neutral" };

export default async function ProposalPage({ params }: { params: Promise<{ id: string; prospectId: string }> }) {
  const { id, prospectId } = await params;
  const s = await getSession();
  const db = await userClient();
  const [{ data: p }, { data: c }, { data: row }, { data: web }] = await Promise.all([
    db.from("prospects").select("id, name, email, website").eq("id", prospectId).eq("campaign_id", id).maybeSingle(),
    db.from("campaigns").select("name").eq("id", id).maybeSingle(),
    db.from("proposals").select("*").eq("prospect_id", prospectId).maybeSingle(),
    db.from("website_previews").select("status, share_enabled, content").eq("prospect_id", prospectId).maybeSingle(),
  ]);
  if (!p || !c) notFound();
  const { data: versions = [] } = row ? await db.from("proposal_versions").select("version, reason, created_at").eq("proposal_id", row.id).order("version", { ascending: false }).limit(20) : { data: [] };
  const write = can(s.role, "campaign:write");
  const base = `/campaigns/${id}/prospects/${prospectId}`;
  const content = row?.content as Proposal | undefined;
  const checks = (row?.checks ?? { missing: [], warnings: [] }) as ProposalCheck;
  const hasPlan = !!web?.content?.growth;

  return (
    <>
      <nav className="mb-3 text-sm text-muted"><Link href={`/campaigns/${id}/proposals`} className="hover:text-ink">{c.name}</Link> / <Link href={base} className="hover:text-ink">{p.name}</Link> / </nav>
      <PageHeader title={`Proposal: ${p.name}`} description="Built from the saved growth plan, competitive position, website preview, financial model and your service prices. Nothing is invented, and nothing is sent from here."
        actions={write && hasPlan && <RunButton run={generateProposal.bind(null, id, prospectId)} className={row ? "btn-secondary" : "btn-primary"}
          confirm={row ? "Rebuild the proposal and email drafts from the latest research? Your edits are replaced; the current version is kept." : undefined}>{row ? "Rebuild from research" : "Draft proposal"}</RunButton>} />

      {!hasPlan ? (
        <Card><Empty title="Generate the website preview first" action={<Link href={`${base}/website`} className="btn-primary">Open website studio</Link>}>The proposal is built from the growth plan the website studio saves. Generate the preview, then come back.</Empty></Card>
      ) : !row || !content?.title ? (
        <Card><Empty title="No proposal yet">{write ? "Draft it from the saved research. It takes a second and uses no AI calls." : "A member hasn't drafted one yet."}</Empty></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="min-w-0 space-y-6 lg:col-span-3">
            <Card title="Proposal" description={`Last updated ${when(row.updated_at)}. This is what the client sees.`}
              actions={<Link href={`/print/proposal/${prospectId}`} target="_blank" className="btn-secondary py-1 text-xs">Open PDF view</Link>}>
              <div className="-mx-5 -mb-5 max-h-[80vh] overflow-y-auto rounded-b-lg border-t border-line bg-white px-6 py-8 sm:px-10"><ProposalDocument p={content} /></div>
            </Card>
            <Card title="Email drafts" description="A first email and two follow-ups from the same facts. Copy them or open them in your own email app; Domain2Revenue sends nothing until approvals and sending arrive in Phase 5.">
              <EmailDrafts campaignId={id} prospectId={prospectId} emails={row.emails as EmailDraft[]} to={p.email} write={write} />
              {!p.email && <p className="mt-3 text-xs text-muted">No public email is on record for {p.name}; add the decision-maker&apos;s address on the prospect page.</p>}
            </Card>
          </div>

          <div className="space-y-6 lg:col-span-2">
            <Card title="Status">
              <div className="space-y-4 text-sm">
                <p className="flex flex-wrap items-center gap-2"><Badge tone={TONE[row.status]}>{row.status}</Badge>{web && !(web.status === "ready" && web.share_enabled) && <span className="text-muted">Preview not shared, so it isn&apos;t linked.</span>}</p>
                {checks.missing.length > 0 && <div><p className="font-medium text-warn">{checks.missing.length} item(s) to fill before it can be marked ready:</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted">{checks.missing.map((m) => <li key={m}>{m}</li>)}</ul></div>}
                {checks.warnings.length > 0 && <div><p className="font-medium">Worth a look</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted">{checks.warnings.map((m) => <li key={m}>{m}</li>)}</ul></div>}
                {write && (
                  <div className="flex flex-wrap gap-2">
                    <RunButton run={setProposalStatus.bind(null, id, prospectId, row.status === "ready" ? "draft" : "ready")} className={row.status === "ready" ? "btn-ghost" : "btn-secondary"} disabled={row.status !== "ready" && checks.missing.length > 0}>{row.status === "ready" ? "Back to draft" : "Mark ready"}</RunButton>
                    {row.status !== "archived" && <RunButton run={setProposalStatus.bind(null, id, prospectId, "archived")} className="btn-ghost">Archive</RunButton>}
                  </div>
                )}
              </div>
            </Card>
            {write && <Card title="Tailor it" description="Changes keep a version first. Rebuilding replaces them with the latest research."><ProposalEditor campaignId={id} prospectId={prospectId} p={content} /></Card>}
            {versions!.length > 0 && (
              <Card title="Versions" description="Saved before each rebuild or edit.">
                <ul className="space-y-1.5 text-sm">
                  {versions!.map((v) => <li key={v.version} className="flex flex-wrap items-center justify-between gap-2"><span><span className="font-medium">v{v.version}</span> <span className="text-muted">{v.reason} · {when(v.created_at)}</span></span>{write && <RestoreButton campaignId={id} prospectId={prospectId} version={v.version} />}</li>)}
                </ul>
              </Card>
            )}
            <Notice tone="neutral">Proposals use the client-safe growth plan only: no competitor names, internal evidence or notes. Impact figures appear only when the financial model is complete, and are labelled as estimates.</Notice>
          </div>
        </div>
      )}
    </>
  );
}
