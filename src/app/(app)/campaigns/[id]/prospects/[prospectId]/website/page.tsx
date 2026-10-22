import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Badge, Card, Empty, Notice, PageHeader, type Tone } from "@/components/ui";
import { RunButton } from "@/components/run-button";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { when } from "@/lib/format";
import { gaps, type SiteContent } from "@/lib/studio/site";
import { Editor } from "./editor";
import { generatePreview, newLink, setPreviewStatus, setSharing } from "./actions";

export const metadata = { title: "Website studio" };
const TONE: Record<string, Tone> = { draft: "neutral", ready: "good", archived: "neutral" };

export default async function WebsitePage({ params }: { params: Promise<{ id: string; prospectId: string }> }) {
  const { id, prospectId } = await params;
  const s = await getSession();
  const db = await userClient();
  const [{ data: p }, { data: c }, { data: w }, { data: domains = [] }] = await Promise.all([
    db.from("prospects").select("id, name, website").eq("id", prospectId).eq("campaign_id", id).maybeSingle(),
    db.from("campaigns").select("name").eq("id", id).maybeSingle(),
    db.from("website_previews").select("*").eq("prospect_id", prospectId).maybeSingle(),
    db.from("domains").select("id, name, status").eq("campaign_id", id).in("status", ["shortlisted", "approved"]).order("score", { ascending: false }).limit(100),
  ]);
  if (!p || !c) notFound();
  const write = can(s.role, "campaign:write");
  const content = w?.content as SiteContent | undefined;
  const todo = content ? gaps(content) : [];
  const url = w ? `${serverEnv("APP_URL").replace(/\/$/, "")}/preview/${w.token}` : null;
  const base = `/campaigns/${id}/prospects/${prospectId}`;

  return (
    <>
      <nav className="mb-3 text-sm text-muted"><Link href={`/campaigns/${id}/prospects`} className="hover:text-ink">{c.name}</Link> / <Link href={base} className="hover:text-ink">{p.name}</Link> / </nav>
      <PageHeader title="Website studio" description={`A tailored concept site for ${p.name}, built from facts we hold. Gaps are highlighted for you to fill; nothing is published to their domain.`}
        actions={write && (w
          ? <RunButton run={generatePreview.bind(null, id, prospectId)} confirm="Rebuild from the latest facts? Your edits to the text will be replaced.">Rebuild from facts</RunButton>
          : <RunButton run={generatePreview.bind(null, id, prospectId)} className="btn-primary">Create draft</RunButton>)} />

      {!w || !content ? (
        <Card><Empty title="No preview yet">{write ? "Create a draft from this business's listing and website check. Run the website check first for better results." : "A member hasn't created a preview yet."}</Empty></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="min-w-0 space-y-6 lg:col-span-3">
            <Card title="Preview" actions={<a href={`/preview/${w.token}`} target="_blank" rel="noopener" className="btn-secondary py-1 text-xs"><ExternalLink className="mr-1 inline size-3.5" />Open full page</a>}>
              <div className="overflow-hidden rounded-lg border border-line bg-white">
                <iframe src={`/preview/${w.token}`} title={`Website preview for ${p.name}`} className="h-[640px] w-full" />
              </div>
            </Card>
            {write && <Card title="Content" description={`Last saved ${when(w.updated_at)}.`}><Editor campaignId={id} prospectId={prospectId} content={content} theme={w.theme} layout={w.layout} domainId={w.domain_id} domains={domains!} /></Card>}
          </div>
          <div className="space-y-6 lg:col-span-2">
            <Card title="Status">
              <div className="space-y-4 text-sm">
                <p className="flex items-center gap-2"><Badge tone={TONE[w.status]}>{w.status}</Badge>{w.share_enabled ? <Badge tone="accent">link shared</Badge> : <span className="text-muted">Private to your workspace</span>}</p>
                {todo.length > 0 && (
                  <div><p className="font-medium text-warn">{todo.length} placeholder(s) to fill before it can be marked ready:</p><ul className="mt-1 list-disc pl-5 text-xs text-muted">{todo.map((g) => <li key={g}>{g}</li>)}</ul></div>
                )}
                <div>
                  <p className="text-xs text-faint">Staging link</p>
                  <p className="break-all font-mono text-xs">{url}</p>
                  <p className="mt-1 text-xs text-muted">{w.share_enabled ? "Anyone with this link can view the preview." : "Only signed-in members of your workspace can open it."} It is never indexed by search engines.</p>
                </div>
                {write && (
                  <div className="flex flex-wrap gap-2">
                    {/* Toggles stay mounted so their result message survives the refresh. */}
                    <RunButton run={setPreviewStatus.bind(null, id, prospectId, w.status === "ready" ? "draft" : "ready")} className={w.status === "ready" ? "btn-ghost" : "btn-secondary"} disabled={w.status !== "ready" && todo.length > 0}>{w.status === "ready" ? "Back to draft" : "Mark ready"}</RunButton>
                    <RunButton run={setSharing.bind(null, id, prospectId, !w.share_enabled)} disabled={!w.share_enabled && w.status !== "ready"}
                      confirm={w.share_enabled ? undefined : "Anyone with the link will be able to view this preview. Continue?"}>{w.share_enabled ? "Turn off share link" : "Turn on share link"}</RunButton>
                    <RunButton run={newLink.bind(null, id, prospectId)} className="btn-ghost" confirm="Replace the link? Any copy sent earlier stops working.">New link</RunButton>
                  </div>
                )}
              </div>
            </Card>
            <Card title="Search and accessibility">
              <dl className="space-y-2 text-sm">
                <div><dt className="text-xs text-faint">Search title</dt><dd>{content.meta.title}</dd></div>
                <div><dt className="text-xs text-faint">Search description</dt><dd>{content.meta.description}</dd></div>
              </dl>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
                <li>Mobile-first layout with a viewport tag and readable type</li>
                <li>Semantic headings, labelled form fields and a skip-free single page</li>
                <li>Structured data (schema.org LocalBusiness) with only the facts above</li>
                <li>No third-party scripts, fonts or trackers</li>
              </ul>
            </Card>
            <Card title="Built from">
              <ul className="space-y-1.5 text-sm">
                {content.sources.length ? content.sources.map((x) => <li key={x.label}>{x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">{x.label}</a> : x.label}</li>) : <li className="text-muted">The business listing only.</li>}
                <li className="text-xs text-muted">Services: {content.services.every((x) => x.source === "website") ? "taken from their website's navigation" : content.services.some((x) => x.source === "placeholder") ? "not known yet" : "entered by your team"}.</li>
              </ul>
            </Card>
            <Notice tone="neutral">No reviews, awards, client names or results are added. Proposed domains are labelled as not owned until you buy them. Deployment to a real domain comes later and needs your approval.</Notice>
          </div>
        </div>
      )}
    </>
  );
}
