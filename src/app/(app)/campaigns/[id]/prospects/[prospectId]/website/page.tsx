import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Empty, Notice, PageHeader, type Tone } from "@/components/ui";
import { RunButton } from "@/components/run-button";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { money, when } from "@/lib/format";
import { gaps, type SiteContent } from "@/lib/studio/site";
import type { GrowthPlan } from "@/lib/studio/growth";
import type { Stage } from "@/lib/studio/compose";
import type { Blueprint } from "@/lib/studio/blueprint";
import { missingInfo, type Inventory } from "@/lib/studio/inventory";
import { computeModel, type Input, type ModelKind } from "@/lib/studio/financial";
import { Editor } from "./editor";
import { PipelineButton, StageList } from "./pipeline";
import { PreviewWorkspace } from "./workspace";
import { RefinePanel, RestoreButton } from "./refine";
import { newLink, setPreviewStatus, setSharing } from "./actions";

export const metadata = { title: "Website studio" };
const TONE: Record<string, Tone> = { draft: "neutral", ready: "good", archived: "neutral" };
const PRIORITY: Record<string, Tone> = { high: "accent", medium: "neutral", low: "neutral" };
const BASIS: Record<string, [string, Tone]> = { observed: ["Observed", "good"], competitor: ["Observed + competitors", "good"], industry: ["Assumption", "warn"] };
const GEN: Record<string, [string, Tone]> = { complete: ["Preview ready", "good"], partial: ["Partial result", "warn"], failed: ["Last run failed", "bad"] };
const LEVEL = ["", "low", "medium", "high"];
const ACTION: Record<string, Tone> = { preserved: "good", improved: "good", merged: "accent", replaced: "accent", excluded: "warn" };
const FEATURE: Record<string, [string, Tone]> = { implemented: ["Built", "good"], simulated: ["Simulated", "warn"], proposed: ["Proposed integration", "accent"], review: ["Needs review", "bad"] };

export default async function WebsitePage({ params }: { params: Promise<{ id: string; prospectId: string }> }) {
  const { id, prospectId } = await params;
  const s = await getSession();
  const db = await userClient();
  const [{ data: p }, { data: c }, { data: w }, { data: domains = [] }, { data: fm }, { data: invRow }] = await Promise.all([
    db.from("prospects").select("id, name, website").eq("id", prospectId).eq("campaign_id", id).maybeSingle(),
    db.from("campaigns").select("name, currency").eq("id", id).maybeSingle(),
    db.from("website_previews").select("*").eq("prospect_id", prospectId).maybeSingle(),
    db.from("domains").select("id, name, status").eq("campaign_id", id).in("status", ["shortlisted", "approved"]).order("score", { ascending: false }).limit(100),
    db.from("financial_models").select("model, inputs").eq("prospect_id", prospectId).maybeSingle(),
    db.from("site_inventories").select("status, crawled_at, inventory").eq("prospect_id", prospectId).maybeSingle(),
  ]);
  const inv = (invRow?.inventory as Inventory | undefined)?.pages ? (invRow!.inventory as Inventory) : null;
  if (!p || !c) notFound();
  const { data: versions = [] } = w
    ? await db.from("website_preview_versions").select("version, reason, created_at").eq("preview_id", w.id).order("version", { ascending: false }).limit(20)
    : { data: [] };
  const write = can(s.role, "campaign:write");
  const content = w?.content as SiteContent | undefined;
  const plan = w?.plan as GrowthPlan | null | undefined;
  const bp = w?.blueprint as Blueprint | null | undefined;
  const gen = w?.generation as { result?: string; stages?: Stage[]; finished_at?: string } | undefined;
  const todo = content ? gaps(content) : [];
  const url = w ? `${serverEnv("APP_URL").replace(/\/$/, "")}/preview/${w.token}` : null;
  const base = `/campaigns/${id}/prospects/${prospectId}`;
  const fin = fm ? computeModel(fm.model as ModelKind, fm.inputs as Record<string, Input>) : null;
  const automations = plan ? [...new Set(plan.gaps.map((g) => g.automation).filter((a) => a !== "—"))].slice(0, 6) : [];

  return (
    <>
      <nav className="mb-3 text-sm text-muted"><Link href={`/campaigns/${id}/studio`} className="hover:text-ink">{c.name}</Link> / <Link href={base} className="hover:text-ink">{p.name}</Link> / </nav>
      <PageHeader title={`Website studio: ${p.name}`} description={`A tailored website and growth plan for ${p.name}, built only from facts we hold about this business. Gaps map to Growth Engines; nothing is published to their domain.`}
        actions={write && (w
          ? <div className="flex flex-wrap items-start gap-2">
              <PipelineButton campaignId={id} prospectId={prospectId} mode="plan" label="Refresh growth plan (keeps text)" className="btn-secondary" />
              <PipelineButton campaignId={id} prospectId={prospectId} mode="site" refresh label="Regenerate with fresh research" className="btn-ghost" confirm="Re-check their website and rebuild the whole preview? Your text edits are replaced; the current version is kept." />
            </div>
          : <PipelineButton campaignId={id} prospectId={prospectId} mode="site" label="Generate preview" />)} />

      {!w || !content ? (
        <Card><Empty title="No preview yet">{write ? "Generate a preview: the app checks their website if needed, maps gaps to Growth Engines and builds the site and plan. No AI calls are made." : "A member hasn't created a preview yet."}</Empty></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="min-w-0 space-y-6 lg:col-span-3">
            <Card title="Preview" description={`Previewing ${p.name}. Proposed redesign, not their live website.`}>
              <PreviewWorkspace token={w.token} name={p.name} currentSite={p.website} hasPlan={!!content.growth} versions={versions!.map((v) => ({ version: v.version, reason: v.reason, at: v.created_at }))} pages={(content.pages ?? []).map((x) => ({ slug: x.slug, title: x.title }))} />
            </Card>

            <Card title="Original website inventory" description={inv ? `${inv.root.replace(/^https?:\/\//, "")}: ${inv.pages.length} page(s) read ${when(invRow!.crawled_at)}${inv.sitemap ? ", using its sitemap" : ""}${inv.robots ? "; robots.txt respected" : ""}. Internal.` : undefined}>
              {!inv ? <p className="text-sm text-muted">{p.website ? "Their website hasn't been read page by page yet. Regenerate with fresh research to read it." : "No website is listed, so the proposed site starts from the listing and the Growth Plan."}</p> : (
                <div className="space-y-3">
                  <div className="-mx-5 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-xs">
                      <thead><tr className="border-b border-line text-left text-faint"><th className="px-5 py-2 font-medium">Original page</th><th className="px-2 py-2 font-medium">Read</th><th className="px-2 py-2 font-medium">Outcome</th><th className="px-5 py-2 font-medium">Why</th></tr></thead>
                      <tbody className="divide-y divide-line">
                        {(bp?.originals ?? inv.pages.map((x) => ({ url: x.url, title: x.title ?? x.url, kind: x.kind, extraction: x.status, action: "", target: null, reason: x.note ?? "" }))).map((o) => (
                          <tr key={o.url}>
                            <td className="px-5 py-2"><a href={o.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium hover:text-accent">{o.title}</a><span className="block text-faint">{new URL(o.url).pathname} · {o.kind}</span></td>
                            <td className="px-2 py-2"><Badge tone={o.extraction === "extracted" ? "good" : o.extraction === "failed" ? "bad" : "warn"}>{o.extraction}</Badge></td>
                            <td className="px-2 py-2">{o.action ? <Badge tone={ACTION[o.action]}>{o.action}{o.target ? ` → ${o.target}` : ""}</Badge> : "—"}</td>
                            <td className="px-5 py-2 text-muted">{o.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {missingInfo(inv).length > 0 && <p className="text-xs text-muted"><span className="font-medium text-warn">Not found on their site:</span> {missingInfo(inv).join("; ")}.</p>}
                  {bp?.review.length ? <details className="text-xs"><summary className="cursor-pointer font-medium text-warn">{bp.review.length} item(s) to review</summary><ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">{bp.review.map((r) => <li key={r}>{r}</li>)}</ul></details> : null}
                </div>
              )}
            </Card>

            {bp && (
              <Card title="Growth Plan implementation checklist" description="Every saved plan recommendation, where it is built in the proposed site, and its honest status. Internal.">
                <div className="-mx-5 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-xs">
                    <thead><tr className="border-b border-line text-left text-faint"><th className="px-5 py-2 font-medium">Recommendation</th><th className="px-2 py-2 font-medium">Where</th><th className="px-2 py-2 font-medium">Status</th><th className="px-5 py-2 font-medium">Notes</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {bp.features.map((x) => (
                        <tr key={x.key}>
                          <td className="px-5 py-2"><span className="font-medium">{x.recommendation}</span><span className="block text-faint">{x.gap} · {x.engine} · {x.priority}</span></td>
                          <td className="px-2 py-2">{x.page}<span className="block text-faint">{x.component}</span></td>
                          <td className="px-2 py-2"><Badge tone={FEATURE[x.status][1]}>{FEATURE[x.status][0]}</Badge></td>
                          <td className="px-5 py-2 text-muted">{x.note || (x.dependencies.length ? `Needs: ${x.dependencies.join("; ")}` : "—")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            <Card title="Gap to growth" description={plan ? `Built ${when(plan.built_at)}. Internal: evidence can name competitors and never appears in the client preview.` : undefined}>
              {!plan ? <p className="text-sm text-muted">This preview predates growth plans. Use “Refresh growth plan” to map its gaps to Growth Engines; your text edits are kept.</p> : (
                <ul className="divide-y divide-line">
                  {plan.gaps.map((g) => (
                    <li key={g.key} className="py-2">
                      <details>
                        <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                          <Badge tone={PRIORITY[g.priority]}>{g.priority}</Badge><span className="font-medium">{g.gap}</span>
                          <span className="text-muted">→ {g.layer === "foundation" ? "Website foundation" : plan.engines.find((e) => e.key === g.layer)?.name}</span>
                          <Badge tone={BASIS[g.basis][1]}>{BASIS[g.basis][0]}</Badge>
                        </summary>
                        <dl className="mt-2 grid gap-x-6 gap-y-1.5 pl-1 text-xs sm:grid-cols-2">
                          <div className="sm:col-span-2"><dt className="inline text-faint">Evidence: </dt><dd className="inline">{g.evidence}</dd></div>
                          <div><dt className="text-faint">Why it matters</dt><dd>{g.why}</dd></div>
                          <div><dt className="text-faint">Recommended solution</dt><dd>{g.solution}</dd></div>
                          <div><dt className="text-faint">Website feature</dt><dd>{g.feature}</dd></div>
                          <div><dt className="text-faint">AI / automation</dt><dd>{g.automation}</dd></div>
                          <div><dt className="text-faint">Customer benefit</dt><dd>{g.benefit}</dd></div>
                          <div><dt className="text-faint">KPI</dt><dd>{g.kpi}</dd></div>
                          <div><dt className="text-faint">Impact · feasibility · confidence</dt><dd>{LEVEL[g.impact]} · {LEVEL[g.feasibility]} · {LEVEL[g.confidence]}</dd></div>
                          <div><dt className="text-faint">Depends on</dt><dd>{g.dependencies.length ? g.dependencies.join("; ") : "Nothing beyond the website"}</dd></div>
                        </dl>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {write && content.growth && content.sections && (
              <Card title="Refine this preview" description={`Changes apply to ${p.name} only; other prospects' previews are untouched.`}>
                <RefinePanel campaignId={id} prospectId={prospectId} engines={content.growth.engines.map((e) => ({ key: e.key, name: e.name }))} focus={content.growth.focus} sections={content.sections} segment={content.growth.segment} />
              </Card>
            )}
            {write && <Card title="Content" description={`Last saved ${when(w.updated_at)}.`}><Editor campaignId={id} prospectId={prospectId} content={content} theme={w.theme} layout={w.layout} domainId={w.domain_id} domains={domains!} /></Card>}
          </div>

          <div className="space-y-6 lg:col-span-2">
            <Card title="Status">
              <div className="space-y-4 text-sm">
                <p className="flex flex-wrap items-center gap-2"><Badge tone={TONE[w.status]}>{w.status}</Badge>{gen?.result && <Badge tone={GEN[gen.result]?.[1] ?? "neutral"}>{GEN[gen.result]?.[0] ?? gen.result}</Badge>}{w.share_enabled ? <Badge tone="accent">link shared</Badge> : <span className="text-muted">Private to your workspace</span>}</p>
                {gen?.stages?.length ? (
                  <details><summary className="cursor-pointer text-xs text-muted">Last generation {gen.finished_at ? when(gen.finished_at) : ""}: what each stage did</summary><div className="mt-2"><StageList run={{ state: gen.result === "failed" ? "failed" : "complete", stages: gen.stages, running: null }} /></div></details>
                ) : null}
                {todo.length > 0 && (
                  <div><p className="font-medium text-warn">{todo.length} placeholder(s) to fill before it can be marked ready:</p><ul className="mt-1 list-disc pl-5 text-xs text-muted">{todo.map((g) => <li key={g}>{g}</li>)}</ul></div>
                )}
                <div>
                  <p className="text-xs text-faint">Staging link</p>
                  <p className="break-all font-mono text-xs">{url}</p>
                  <p className="mt-1 text-xs text-muted">{w.share_enabled ? "Anyone with this link can view the website and growth plan." : "Only signed-in members of your workspace can open it."} It is never indexed by search engines, and shows no internal notes, evidence or financials.</p>
                </div>
                {write && (
                  <div className="flex flex-wrap gap-2">
                    {/* Toggles stay mounted so their result message survives the refresh. */}
                    <RunButton run={setPreviewStatus.bind(null, id, prospectId, w.status === "ready" ? "draft" : "ready")} className={w.status === "ready" ? "btn-ghost" : "btn-secondary"} disabled={w.status !== "ready" && todo.length > 0}>{w.status === "ready" ? "Back to draft" : "Mark ready"}</RunButton>
                    <RunButton run={setSharing.bind(null, id, prospectId, !w.share_enabled)} disabled={!w.share_enabled && w.status !== "ready"}
                      confirm={w.share_enabled ? undefined : "Anyone with the link will be able to view this preview and its growth plan. Continue?"}>{w.share_enabled ? "Turn off share link" : "Turn on share link"}</RunButton>
                    <RunButton run={newLink.bind(null, id, prospectId)} className="btn-ghost" confirm="Replace the link? Any copy sent earlier stops working.">New link</RunButton>
                  </div>
                )}
              </div>
            </Card>

            {plan && (
              <Card title="Business summary" description="For your call preparation. Internal.">
                <dl className="space-y-3 text-sm">
                  <div><dt className="text-xs text-faint">Existing problem</dt><dd>{plan.summary.problem}</dd></div>
                  <div><dt className="text-xs text-faint">Recommended transformation</dt><dd>{plan.summary.transformation}</dd></div>
                  <div><dt className="text-xs text-faint">Priority Growth Engines</dt><dd><ol className="list-decimal pl-5">{plan.engines.filter((e) => e.primary).map((e) => <li key={e.key}>{e.name}</li>)}</ol></dd></div>
                  <div><dt className="text-xs text-faint">AI and automation opportunities</dt><dd><ul className="list-disc pl-5">{automations.map((a) => <li key={a}>{a}</li>)}</ul></dd></div>
                  <div><dt className="text-xs text-faint">Expected benefits</dt><dd><ul className="list-disc pl-5">{plan.summary.benefits.map((b) => <li key={b}>{b}</li>)}</ul></dd></div>
                  <div><dt className="text-xs text-faint">KPIs to track</dt><dd>{plan.kpis.join("; ")}</dd></div>
                  <div><dt className="text-xs text-faint">Dependencies</dt><dd>{plan.dependencies.join("; ") || "None"}</dd></div>
                  <div><dt className="text-xs text-faint">Rollout</dt><dd><ol className="list-decimal pl-5">{plan.rollout.map((r) => <li key={r.title}>{r.title.replace(/^Phase \d: /, "")} ({r.items.length} item{r.items.length === 1 ? "" : "s"})</li>)}</ol></dd></div>
                  <div><dt className="text-xs text-faint">Illustrative impact</dt><dd>
                    {fin?.ok ? <>Base case {money(fin.scenarios[1].incremental_revenue_year, c.currency, { maximumFractionDigits: 0 })} a year, {fin.confidence}% confidence. <span className="text-muted">An estimate from the <Link href={`${base}/financials`} className="text-accent hover:underline">financial model</Link>&apos;s inputs, not a promise; it is not shown to the client.</span></>
                      : <span className="text-muted">No estimate yet. <Link href={`${base}/financials`} className="text-accent hover:underline">Add the financial model inputs</Link>; nothing is guessed.</span>}
                  </dd></div>
                </dl>
              </Card>
            )}

            {versions!.length > 0 && (
              <Card title="Versions" description="Saved before each rebuild, refinement or edit. Kept for this prospect only.">
                <ul className="space-y-1.5 text-sm">
                  {versions!.map((v) => (
                    <li key={v.version} className="flex flex-wrap items-center justify-between gap-2">
                      <span><span className="font-medium">v{v.version}</span> <span className="text-muted">{v.reason} · {when(v.created_at)}</span></span>
                      <span className="flex gap-1"><a href={`/preview/${w.token}?v=${v.version}`} target="_blank" rel="noopener" className="btn-ghost py-0.5 text-xs">View</a>{write && <RestoreButton campaignId={id} prospectId={prospectId} version={v.version} />}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card title="Built from">
              <ul className="space-y-1.5 text-sm">
                {content.sources.length ? content.sources.map((x) => <li key={x.label}>{x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">{x.label}</a> : x.label}</li>) : <li className="text-muted">The business listing only.</li>}
                <li className="text-xs text-muted">Services: {content.services.every((x) => x.source === "website") ? "taken from their website's navigation" : content.services.some((x) => x.source === "placeholder") ? "not known yet" : "entered by your team"}.</li>
              </ul>
              {plan && (
                <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                  <div><p className="font-medium text-good">Verified</p><ul className="mt-1 list-disc pl-4 text-muted">{plan.verified.map((v) => <li key={v}>{v}</li>)}</ul></div>
                  <div><p className="font-medium text-warn">Not verified</p><ul className="mt-1 list-disc pl-4 text-muted">{plan.unverified.map((v) => <li key={v}>{v}</li>)}</ul></div>
                </div>
              )}
            </Card>
            <Card title="Search and accessibility">
              <dl className="space-y-2 text-sm">
                <div><dt className="text-xs text-faint">Search title</dt><dd>{content.meta.title}</dd></div>
                <div><dt className="text-xs text-faint">Search description</dt><dd>{content.meta.description}</dd></div>
              </dl>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
                <li>Mobile-first layout with a viewport tag and readable type</li>
                <li>Semantic headings and labelled form fields</li>
                <li>Structured data (schema.org LocalBusiness) with only the facts above</li>
                <li>No third-party scripts, fonts or trackers</li>
              </ul>
            </Card>
            <Notice tone="neutral">No reviews, awards, client names or results are added. Demos are labelled as working, simulated, proposed or not configured, and send nothing. Deployment to a real domain comes later and needs your approval.</Notice>
          </div>
        </div>
      )}
    </>
  );
}
