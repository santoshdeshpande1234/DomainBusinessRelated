"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePerm } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { auditWebsite, loadCampaign, rescoreProspects, saveAudit } from "@/lib/discovery/service";
import { crawlStep } from "@/lib/studio/crawl";
import { missingInfo, type Inventory } from "@/lib/studio/inventory";
import type { GrowthPlan } from "@/lib/studio/growth";
import { INDUSTRIES, labelOf } from "@/lib/options";
import type { Audit } from "@/lib/discovery/prospects";
import type { Side } from "@/lib/studio/competitors";
import { ENGINES, profileFor, type EngineKey } from "@/lib/studio/growth";
import { REFINEMENTS, STAGES, compose, refine, type Refinement, type Stage } from "@/lib/studio/compose";
import { LAYOUTS, SECTION_LABELS, THEMES, gaps, type Sections, type SiteContent, type SiteFacts } from "@/lib/studio/site";
import type { StepResult } from "../../../domains/actions";

export type PipelineResult = StepResult & { stages?: Stage[] };

/** Website checks older than this are refreshed before a preview is generated. */
const AUDIT_MAX_AGE_DAYS = 30;
/** Versions kept per preview; older ones are pruned. */
const KEEP_VERSIONS = 20;

async function ctx(campaignId: string, prospectId: string) {
  const s = await requirePerm("campaign:write");
  const db = await userClient();
  const c = await loadCampaign(db, campaignId);
  const { data: p } = await db.from("prospects").select("*").eq("id", prospectId).eq("campaign_id", c.id).maybeSingle();
  if (!p) throw new Error("Prospect not found.");
  const { data: w } = await db.from("website_previews").select("*").eq("prospect_id", p.id).maybeSingle();
  return { s, db, c, p, w };
}
const done = (campaignId: string, prospectId: string) => {
  revalidatePath(`/campaigns/${campaignId}/prospects/${prospectId}/website`);
  revalidatePath(`/campaigns/${campaignId}/studio`);
};

type Ctx = Awaited<ReturnType<typeof ctx>>;

function siteFacts({ c, p }: Pick<Ctx, "c" | "p">): SiteFacts {
  return {
    id: p.id, name: p.name, category: p.category, city: p.city, industry: c.industry,
    industryLabel: c.industry === "custom" ? c.custom_industry ?? "Services" : labelOf(INDUSTRIES, c.industry),
    phone: p.phone, email: p.email, address: p.address, maps_url: p.origin === "google_places" ? p.origin_url : null, website: p.website, audit: p.audit as Audit | null,
  };
}

/** Everything one prospect's preview is built from. Queries are scoped to this prospect only. */
async function gather(x: Pick<Ctx, "db" | "c" | "p">) {
  const [{ data: comps = [] }, { data: names = [] }, { data: inv }] = await Promise.all([
    x.db.from("competitors").select("name, audit, reviews, rating, website").eq("prospect_id", x.p.id),
    x.db.from("prospects").select("name").eq("campaign_id", x.c.id).neq("id", x.p.id),
    x.db.from("site_inventories").select("inventory").eq("prospect_id", x.p.id).maybeSingle(),
  ]);
  const competitors: Side[] = comps!.map((k) => ({ name: k.name, audit: k.audit as Audit | null, reviews: k.reviews, rating: k.rating == null ? null : Number(k.rating), hasWebsite: !!k.website }));
  // The client-facing preview must not mention other prospects or this prospect's competitors.
  const others = [...names!.map((n) => n.name), ...competitors.map((k) => k.name)];
  const inventory = (inv?.inventory as Inventory | undefined)?.pages ? (inv!.inventory as Inventory) : null;
  return { facts: siteFacts(x), reviews: (x.p.score_detail?.reviews as number | undefined) ?? null, rating: (x.p.score_detail?.rating as number | undefined) ?? null, competitors, others, inventory };
}

/** Snapshots the current content before it changes. Best effort: a failed snapshot never blocks the edit. */
async function snapshot(x: Pick<Ctx, "db" | "c" | "s" | "w">, reason: string) {
  const w = x.w;
  if (!w?.content?.brand) return;
  const { data: last } = await x.db.from("website_preview_versions").select("version").eq("preview_id", w.id).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (last?.version ?? 0) + 1;
  const { error } = await x.db.from("website_preview_versions").insert({
    workspace_id: x.c.workspace_id, campaign_id: x.c.id, preview_id: w.id, version, reason: reason.slice(0, 200),
    content: w.content, theme: w.theme, layout: w.layout, plan: w.plan ?? null, created_by: x.s.userId,
  });
  if (error) { console.warn("website preview version not saved", { preview: w.id, code: error.code }); return; }
  if (version > KEEP_VERSIONS) await x.db.from("website_preview_versions").delete().eq("preview_id", w.id).lte("version", version - KEEP_VERSIONS);
}

const stageSchema = z.array(z.object({
  key: z.enum(STAGES.map((s) => s.key) as [Stage["key"], ...Stage["key"][]]), status: z.enum(["done", "partial", "skipped", "failed"]), note: z.string().max(300),
})).max(STAGES.length);

const generation = (stages: Stage[]) => ({
  result: stages.some((s) => s.status === "failed") ? "failed" : stages.some((s) => s.status === "partial") ? "partial" : "complete",
  stages, finished_at: new Date().toISOString(),
});

/**
 * Stages 1–2: checks the prospect's context and refreshes its website check when it is missing or
 * stale. The only external call is the app's own fetch of the business's home page.
 */
export async function researchPreview(campaignId: string, prospectId: string, refresh = false): Promise<PipelineResult> {
  const stages: Stage[] = [];
  try {
    const x = await ctx(campaignId, prospectId);
    const known = [x.p.website && "website", x.p.phone && "phone", x.p.address && "address", x.p.email && "email", x.p.category && "category"].filter(Boolean);
    stages.push({ key: "context", status: known.length ? "done" : "partial", note: `${x.p.name}: ${known.length ? known.join(", ") : "only a name"} on record.` });
    if (!x.p.website) {
      stages.push({ key: "research", status: "skipped", note: "No website listed; the plan starts from a new site." });
      return { ok: "Context loaded.", stages };
    }
    const a = x.p.audit as Audit | null;
    const age = x.p.audited_at ? (Date.now() - new Date(x.p.audited_at).getTime()) / 86_400_000 : Infinity;
    const stale = !a || age > AUDIT_MAX_AGE_DAYS || a.chat === undefined;
    if (!refresh && !stale) {
      stages.push({ key: "research", status: a.error ? "partial" : "done", note: a.error ? `Stored check failed (${a.error}); site details are unverified.` : `Reused the website check from ${Math.floor(age)} day(s) ago.` });
      return { ok: "Context loaded.", stages };
    }
    const fresh = await auditWebsite(x.p.website);
    await saveAudit(x.db, x.c, x.s.userId, x.p, fresh);
    await rescoreProspects(x.db, x.c, x.s.userId, [x.p.id]);
    stages.push({ key: "research", status: fresh.error ? "partial" : "done", note: fresh.error ? `Website could not be loaded (${fresh.error}); stored facts are used and marked unverified.` : `Home page checked (HTTP ${fresh.status}, ${(fresh.ms / 1000).toFixed(1)} s).` });
    return { ok: "Website checked.", stages };
  } catch (e) {
    stages.push({ key: stages.length ? "research" : "context", status: "failed", note: (e as Error).message.slice(0, 300) });
    return { error: (e as Error).message, stages };
  }
}

/**
 * Reads their website page by page (a few pages per call; the caller repeats while pages remain).
 * Uses the app's own safe fetcher, honours robots.txt, and reuses an inventory under 30 days old.
 */
export async function crawlPreview(campaignId: string, prospectId: string, refresh = false): Promise<PipelineResult> {
  try {
    const x = await ctx(campaignId, prospectId);
    if (!x.p.website) return { ok: "No website to read.", stages: [{ key: "inventory", status: "skipped", note: "No website listed; the proposed site starts from the listing and the Growth Plan." }] };
    const r = await crawlStep(x.db, { workspace_id: x.c.workspace_id, campaign_id: x.c.id, prospect_id: x.p.id, website: x.p.website, userId: x.s.userId }, refresh);
    const read = r.inventory.pages.filter((p) => p.status === "extracted").length;
    const failed = r.inventory.pages.filter((p) => p.status !== "extracted").length;
    const missing = missingInfo(r.inventory);
    done(campaignId, prospectId);
    return {
      ok: r.remaining ? `Read ${r.inventory.pages.length} page(s) so far.` : "Website read.", remaining: r.remaining,
      stages: [{ key: "inventory", status: r.remaining ? "done" : failed || missing.length ? "partial" : "done",
        note: `${r.reused ? "Reused the page inventory from the last 30 days. " : ""}${read} page(s) read${failed ? `, ${failed} unreadable` : ""} of ${r.inventory.discovered} discovered${r.inventory.sitemap ? " (sitemap used)" : ""}${r.remaining ? `; ${r.remaining} still queued` : ""}.${missing.length ? ` Not found: ${missing.join(", ")}.` : ""}`.slice(0, 300) }],
    };
  } catch (e) {
    return { error: (e as Error).message, stages: [{ key: "inventory", status: "partial", note: `Pages could not be read (${(e as Error).message}); the home-page check is used instead.`.slice(0, 300) }] };
  }
}

/**
 * Stages 3–9: gap analysis, Growth Engines, content, validation and save. "site" rebuilds the whole
 * preview (a version of the old one is kept); "plan" refreshes only the growth layer and keeps text edits.
 */
export async function buildPreview(campaignId: string, prospectId: string, mode: "site" | "plan", research: Stage[] = []): Promise<PipelineResult> {
  const prior = stageSchema.safeParse(research).data ?? [];
  try {
    const x = await ctx(campaignId, prospectId);
    const m = z.enum(["site", "plan"]).parse(mode);
    const input = await gather(x);
    const existing = x.w?.content?.brand ? (x.w.content as SiteContent) : null;
    const r = compose({ ...input, mode: existing ? m : "site", existing, savedPlan: (x.w?.plan as GrowthPlan | null) ?? null });
    if (!r.ok) {
      if (x.w) await x.db.from("website_previews").update({ generation: generation([...prior, ...r.stages]), updated_by: x.s.userId }).eq("id", x.w.id);
      done(campaignId, prospectId);
      return { error: r.error, stages: [...prior, ...r.stages] };
    }
    const placeholders = gaps(r.content).length;
    const stages: Stage[] = [...prior, ...r.stages, { key: "save", status: "done", note: x.w ? "Saved; the previous version was kept." : "Saved as a new draft." }];
    if (x.w) {
      await snapshot(x, m === "plan" ? "Before growth plan refresh" : "Before rebuild");
      const { error } = await x.db.from("website_previews").update({
        content: r.content, plan: r.plan, blueprint: r.blueprint, generation: generation(stages), updated_by: x.s.userId,
        ...(m === "site" || (placeholders && x.w.status === "ready") ? { status: "draft" } : {}),
      }).eq("id", x.w.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await x.db.from("website_previews").insert({
        workspace_id: x.c.workspace_id, campaign_id: x.c.id, prospect_id: x.p.id, content: r.content, plan: r.plan, blueprint: r.blueprint, ...r.design,
        generation: generation(stages), created_by: x.s.userId, updated_by: x.s.userId,
      });
      if (error) throw new Error(error.message);
    }
    done(campaignId, prospectId);
    const engines = r.plan.engines.filter((e) => e.primary).length;
    return { ok: `Preview ${x.w ? (m === "plan" ? "growth plan refreshed" : "rebuilt") : "created"} with ${r.plan.gaps.length} gaps mapped to ${engines} priority engine(s)${placeholders ? `; ${placeholders} item(s) need your input` : ""}${r.warnings.length ? "; check the validation warning" : ""}.`, stages };
  } catch (e) {
    return { error: (e as Error).message, stages: [...prior, { key: "save", status: "failed", note: (e as Error).message.slice(0, 300) }] };
  }
}

/** Creates the first draft, or rebuilds it from the latest facts (replacing edits; a version is kept). */
export async function generatePreview(campaignId: string, prospectId: string): Promise<StepResult> {
  const r = await buildPreview(campaignId, prospectId, "site");
  if (r.error) return { error: r.error };
  const created = /created/.test(r.ok ?? "");
  const n = Number(r.ok?.match(/(\d+) item\(s\) need your input/)?.[1] ?? 0);
  return { ok: `Draft ${created ? "created" : "rebuilt"}${n ? `; ${n} item(s) need your input` : ""}.` };
}

/** One refinement, applied to this prospect's preview only. */
export async function refinePreview(campaignId: string, prospectId: string, what: string, value?: string): Promise<StepResult> {
  try {
    const x = await ctx(campaignId, prospectId);
    if (!x.w?.content?.brand) return { error: "Create a draft first." };
    const kind = z.enum(Object.keys(REFINEMENTS) as [Refinement, ...Refinement[]]).parse(what);
    const r = refine(x.w.content as SiteContent, kind, { name: x.p.name, heroTemplate: profileFor(x.c.industry).hero, segment: z.string().max(100).optional().parse(value) });
    if ("error" in r) return { error: r.error };
    await snapshot(x, `Before “${REFINEMENTS[kind]}”`);
    const { error } = await x.db.from("website_previews").update({ content: r.content, ...(r.theme ? { theme: r.theme } : {}), ...(r.layout ? { layout: r.layout } : {}), updated_by: x.s.userId }).eq("id", x.w.id);
    if (error) throw new Error(error.message);
    done(campaignId, prospectId);
    return { ok: r.ok };
  } catch (e) { return { error: (e as Error).message }; }
}

/** Moves one Growth Engine to the front of this preview's plan. */
export async function focusPreview(campaignId: string, prospectId: string, engine: string): Promise<StepResult> {
  try {
    const key = z.enum(Object.keys(ENGINES) as [EngineKey, ...EngineKey[]]).parse(engine);
    const x = await ctx(campaignId, prospectId);
    if (!x.w?.content?.growth) return { error: "Add the growth plan first." };
    if (!(x.w.content as SiteContent).growth!.engines.some((e) => e.key === key)) return { error: "That engine has no supporting gap for this business." };
    const r = await buildPreviewFocus(x, key);
    done(campaignId, prospectId);
    return r;
  } catch (e) { return { error: (e as Error).message }; }
}
async function buildPreviewFocus(x: Ctx, key: EngineKey): Promise<StepResult> {
  const input = await gather(x);
  const r = compose({ ...input, mode: "plan", existing: x.w!.content as SiteContent, focus: key });
  if (!r.ok) return { error: r.error };
  await snapshot(x, "Before engine priority change");
  const { error } = await x.db.from("website_previews").update({ content: r.content, plan: r.plan, blueprint: r.blueprint, updated_by: x.s.userId }).eq("id", x.w!.id);
  if (error) throw new Error(error.message);
  return { ok: `${r.plan.engines.find((e) => e.key === key)?.name ?? "Engine"} is now the lead engine.` };
}

/** Shows or hides one optional section. */
export async function setSection(campaignId: string, prospectId: string, section: string, on: boolean): Promise<StepResult> {
  try {
    const key = z.enum(Object.keys(SECTION_LABELS) as [keyof Sections, ...(keyof Sections)[]]).parse(section);
    const x = await ctx(campaignId, prospectId);
    const c = x.w?.content as SiteContent | undefined;
    if (!c?.sections) return { error: "Add the growth plan first." };
    const { error } = await x.db.from("website_previews").update({ content: { ...c, sections: { ...c.sections, [key]: on } }, updated_by: x.s.userId }).eq("id", x.w!.id);
    if (error) throw new Error(error.message);
    done(campaignId, prospectId);
    return { ok: `${SECTION_LABELS[key]} ${on ? "shown" : "hidden"}.` };
  } catch (e) { return { error: (e as Error).message }; }
}

/** Restores a saved version (the current content is kept as a version first). */
export async function restoreVersion(campaignId: string, prospectId: string, version: number): Promise<StepResult> {
  try {
    const x = await ctx(campaignId, prospectId);
    if (!x.w) return { error: "Create a draft first." };
    const { data: v } = await x.db.from("website_preview_versions").select("*").eq("preview_id", x.w.id).eq("version", z.number().int().positive().parse(version)).maybeSingle();
    if (!v) return { error: "Version not found." };
    await snapshot(x, `Before restoring version ${v.version}`);
    const content = v.content as SiteContent;
    const { error } = await x.db.from("website_previews").update({
      content, plan: v.plan, theme: v.theme, layout: v.layout, updated_by: x.s.userId, ...(gaps(content).length && x.w.status === "ready" ? { status: "draft" } : {}),
    }).eq("id", x.w.id);
    if (error) throw new Error(error.message);
    done(campaignId, prospectId);
    return { ok: `Version ${v.version} restored.` };
  } catch (e) { return { error: (e as Error).message }; }
}

const line = z.string().trim().max(200);
const editSchema = z.object({
  meta_title: z.string().trim().min(1).max(70), meta_description: z.string().trim().min(1).max(160),
  eyebrow: line, headline: z.string().trim().min(1).max(120), sub: z.string().trim().max(300),
  primary_cta: z.string().trim().min(1).max(40), secondary_cta: z.string().trim().min(1).max(40),
  services: z.string().max(3000), features: z.string().max(1500), steps: z.string().max(800), about: z.string().trim().max(2000),
  theme: z.enum(Object.keys(THEMES) as [keyof typeof THEMES]), layout: z.enum(Object.keys(LAYOUTS) as [keyof typeof LAYOUTS]),
  domain_id: z.string().uuid().or(z.literal("")),
});
const lines = (s: string, max: number) => s.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, max).map((x) => x.slice(0, 200));

export async function saveContent(campaignId: string, prospectId: string, _: StepResult | undefined, form: FormData): Promise<StepResult> {
  try {
    const x = await ctx(campaignId, prospectId);
    const { s, db, w } = x;
    if (!w) return { error: "Create a draft first." };
    const v = editSchema.safeParse(Object.fromEntries(form));
    if (!v.success) return { error: v.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    const d = v.data;
    const old = w.content as SiteContent;
    const services = lines(d.services, 9).map((l) => {
      const [title, ...rest] = l.split("|");
      const prev = old.services.find((x) => x.title === title.trim());
      return { title: title.trim(), text: rest.join("|").trim(), slug: prev?.slug ?? null, source: prev && prev.source !== "placeholder" ? prev.source : /\[\[/.test(title) ? "placeholder" : "member" } as const;
    });
    if (!services.length) return { error: "Add at least one service." };
    const content: SiteContent = {
      ...old, meta: { title: d.meta_title, description: d.meta_description }, brand: { ...old.brand, eyebrow: d.eyebrow },
      hero: { headline: d.headline, sub: d.sub, primary_cta: d.primary_cta, secondary_cta: d.secondary_cta },
      services, features: lines(d.features, 6), steps: lines(d.steps, 4), about: d.about,
    };
    const g = gaps(content);
    await snapshot(x, "Before text edit");
    const { error } = await db.from("website_previews").update({
      content, theme: d.theme, layout: d.layout, domain_id: d.domain_id || null, updated_by: s.userId,
      ...(g.length && w.status === "ready" ? { status: "draft" } : {}),
    }).eq("id", w.id);
    if (error) throw new Error(error.message);
    done(campaignId, prospectId);
    return { ok: g.length ? `Saved. ${g.length} placeholder(s) left.` : "Saved." };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function setPreviewStatus(campaignId: string, prospectId: string, status: string): Promise<StepResult> {
  try {
    const { s, db, w } = await ctx(campaignId, prospectId);
    if (!w) return { error: "Create a draft first." };
    const st = z.enum(["draft", "ready", "archived"]).parse(status);
    if (st === "ready" && gaps(w.content as SiteContent).length) return { error: "Fill in every highlighted placeholder before marking it ready." };
    const { error } = await db.from("website_previews").update({ status: st, updated_by: s.userId, ...(st === "archived" ? { share_enabled: false } : {}) }).eq("id", w.id);
    if (error) throw new Error(error.message);
    done(campaignId, prospectId);
    return { ok: st === "ready" ? "Marked ready." : st === "archived" ? "Archived and unshared." : "Back to draft." };
  } catch (e) { return { error: (e as Error).message }; }
}

/** Turns the share link on or off. Sharing only works for previews marked ready. */
export async function setSharing(campaignId: string, prospectId: string, on: boolean): Promise<StepResult> {
  try {
    const { s, db, w } = await ctx(campaignId, prospectId);
    if (!w) return { error: "Create a draft first." };
    if (on && w.status !== "ready") return { error: "Mark the preview ready before sharing it." };
    const { error } = await db.from("website_previews").update({ share_enabled: on, updated_by: s.userId }).eq("id", w.id);
    if (error) throw new Error(error.message);
    done(campaignId, prospectId);
    return { ok: on ? "Anyone with the link can now view it." : "Link turned off." };
  } catch (e) { return { error: (e as Error).message }; }
}

/** Replaces the link so any copy sent earlier stops working. */
export async function newLink(campaignId: string, prospectId: string): Promise<StepResult> {
  try {
    const { s, db, w } = await ctx(campaignId, prospectId);
    if (!w) return { error: "Create a draft first." };
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await db.from("website_previews").update({ token, share_enabled: false, updated_by: s.userId }).eq("id", w.id);
    if (error) throw new Error(error.message);
    done(campaignId, prospectId);
    return { ok: "New link created; the old one no longer works. Sharing is off." };
  } catch (e) { return { error: (e as Error).message }; }
}
