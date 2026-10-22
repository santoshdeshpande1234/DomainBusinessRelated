import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Empty, PageHeader, type Tone } from "@/components/ui";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import { MODULES } from "@/lib/options";
import { computeModel, type Input, type ModelKind } from "@/lib/studio/financial";
import { scoreTone } from "@/lib/discovery/labels";
import { StudioBatch, type StudioRow } from "./batch";

const WEB_TONE: Record<string, Tone> = { draft: "neutral", ready: "good", archived: "neutral" };
type Focus = "competitors" | "financials" | "studio";

/** One table of selected prospects with their competitor, financial and website progress. */
export async function Overview({ id, focus }: { id: string; focus: Focus }) {
  const s = await getSession();
  const db = await userClient();
  const [{ data: c }, { data: ps = [] }, { data: comps = [] }, { data: models = [] }, { data: webs = [] }] = await Promise.all([
    db.from("campaigns").select("name, currency").eq("id", id).maybeSingle(),
    db.from("prospects").select("id, name, category, score, website, audit, audited_at").eq("campaign_id", id).eq("status", "selected").order("score", { ascending: false, nullsFirst: false }),
    db.from("competitors").select("prospect_id, audited_at").eq("campaign_id", id),
    db.from("financial_models").select("prospect_id, model, inputs").eq("campaign_id", id),
    db.from("website_previews").select("prospect_id, status, share_enabled, generation").eq("campaign_id", id),
  ]);
  if (!c) notFound();
  const m = MODULES.find((x) => x.key === focus)!;
  const write = can(s.role, "campaign:write");
  const $ = (n: number) => money(n, c.currency, { maximumFractionDigits: 0 });

  return (
    <>
      <nav className="mb-3 text-sm text-muted"><Link href="/campaigns" className="hover:text-ink">Campaigns</Link> / <Link href={`/campaigns/${id}`} className="hover:text-ink">{c.name}</Link> / </nav>
      <PageHeader title={m.label} description={focus === "studio"
        ? "Turn each selected prospect's research into a tailored website preview and growth plan: gaps mapped to Growth Engines, interactive demos, and a client-ready presentation."
        : `${m.text} Works on the prospects you selected for proposals.`} />
      <Card>
        {ps!.length === 0 ? (
          <Empty title="No prospects selected yet" action={<Link href={`/campaigns/${id}/prospects`} className="btn-primary">Open prospect research</Link>}>Select the businesses you want to pitch on the prospects page, then analyse competitors, model the opportunity and draft a website here.</Empty>
        ) : focus === "studio" ? (
          <div className="-mx-5 -my-5"><StudioBatch campaignId={id} write={write} rows={ps!.map((p): StudioRow => {
            const w = webs!.find((x) => x.prospect_id === p.id);
            return {
              id: p.id, name: p.name, website: p.website, category: p.category,
              audited: !p.website ? "no website" : !p.audited_at ? "not checked" : p.audit?.error ? "failed" : "checked",
              preview: w ? { status: w.status, shared: w.share_enabled, generation: w.generation?.result ?? null } : null,
            };
          })} /></div>
        ) : (
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-faint">
                <th className="px-5 py-3 font-medium">Prospect</th><th className="px-3 py-3 font-medium">Score</th>
                <th className="px-3 py-3 font-medium">Competitors</th><th className="px-3 py-3 font-medium">Base case / year</th><th className="px-5 py-3 font-medium">Website preview</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {ps!.map((p) => {
                  const cs = comps!.filter((x) => x.prospect_id === p.id);
                  const fm = models!.find((x) => x.prospect_id === p.id);
                  const r = fm ? computeModel(fm.model as ModelKind, fm.inputs as Record<string, Input>) : null;
                  const w = webs!.find((x) => x.prospect_id === p.id);
                  const base = `/campaigns/${id}/prospects/${p.id}`;
                  return (
                    <tr key={p.id}>
                      <td className="px-5 py-3"><Link href={base} className="font-medium hover:text-accent">{p.name}</Link>{p.category && <span className="block text-xs text-faint">{p.category}</span>}</td>
                      <td className="px-3 py-3"><Badge tone={scoreTone(p.score)}>{p.score ?? "—"}</Badge></td>
                      <td className="px-3 py-3"><Link href={`${base}/competitors`} className="hover:text-accent">{cs.length ? `${cs.length} (${cs.filter((x) => x.audited_at).length} checked)` : "Not started"}</Link></td>
                      <td className="px-3 py-3 tabular-nums"><Link href={`${base}/financials`} className="hover:text-accent">{r?.ok ? <>{$(r.scenarios[1].incremental_revenue_year)} <span className="text-xs text-faint">{r.confidence}% conf.</span></> : fm ? "Inputs needed" : "Not started"}</Link></td>
                      <td className="px-5 py-3"><Link href={`${base}/website`} className="hover:text-accent">{w ? <span className="flex gap-1.5"><Badge tone={WEB_TONE[w.status]}>{w.status}</Badge>{w.share_enabled && <Badge tone="accent">shared</Badge>}</span> : "Not started"}</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">Base case figures are estimates from each model&apos;s inputs, not the businesses&apos; verified revenue.</p>
    </>
  );
}
