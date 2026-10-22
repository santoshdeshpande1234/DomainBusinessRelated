"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePerm } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { loadCampaign } from "@/lib/discovery/service";
import { INDUSTRIES, labelOf } from "@/lib/options";
import type { Audit } from "@/lib/discovery/prospects";
import { LAYOUTS, THEMES, buildSite, gaps, pickDesign, type SiteContent } from "@/lib/studio/site";
import type { StepResult } from "../../../domains/actions";

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
function draft({ c, p }: Pick<Ctx, "c" | "p">) {
  const facts = {
    id: p.id, name: p.name, category: p.category, city: p.city, industry: c.industry,
    industryLabel: c.industry === "custom" ? c.custom_industry ?? "Services" : labelOf(INDUSTRIES, c.industry),
    phone: p.phone, email: p.email, address: p.address, maps_url: p.origin === "google_places" ? p.origin_url : null, website: p.website, audit: p.audit as Audit | null,
  };
  return { content: buildSite(facts), ...pickDesign(facts) };
}

/** Creates the first draft, or rebuilds it from the latest facts (replacing edits). */
export async function generatePreview(campaignId: string, prospectId: string): Promise<StepResult> {
  try {
    const x = await ctx(campaignId, prospectId);
    const d = draft(x);
    const { error } = x.w
      ? await x.db.from("website_previews").update({ content: d.content, status: "draft", updated_by: x.s.userId }).eq("id", x.w.id)
      : await x.db.from("website_previews").insert({ workspace_id: x.c.workspace_id, campaign_id: x.c.id, prospect_id: x.p.id, ...d, created_by: x.s.userId, updated_by: x.s.userId });
    if (error) throw new Error(error.message);
    done(campaignId, prospectId);
    const g = gaps(d.content).length;
    return { ok: `Draft ${x.w ? "rebuilt" : "created"}${g ? `; ${g} item(s) need your input` : ""}.` };
  } catch (e) { return { error: (e as Error).message }; }
}

/** Drafts previews for every selected prospect that doesn't have one yet. Pure templating, no external calls. */
export async function generateSelected(campaignId: string): Promise<StepResult> {
  try {
    const s = await requirePerm("campaign:write");
    const db = await userClient();
    const c = await loadCampaign(db, campaignId);
    const [{ data: ps }, { data: have }] = await Promise.all([
      db.from("prospects").select("*").eq("campaign_id", c.id).eq("status", "selected"),
      db.from("website_previews").select("prospect_id").eq("campaign_id", c.id),
    ]);
    const drafted = new Set(have?.map((h) => h.prospect_id));
    const todo = (ps ?? []).filter((p) => !drafted.has(p.id));
    if (!todo.length) return { ok: (ps ?? []).length ? "Every selected prospect already has a draft." : "Select prospects for proposals first." };
    const { error } = await db.from("website_previews").insert(todo.map((p) => ({ workspace_id: c.workspace_id, campaign_id: c.id, prospect_id: p.id, ...draft({ c, p }), created_by: s.userId, updated_by: s.userId })));
    if (error) throw new Error(error.message);
    revalidatePath(`/campaigns/${campaignId}/studio`);
    return { ok: `Created ${todo.length} draft(s).` };
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
    const { s, db, w } = await ctx(campaignId, prospectId);
    if (!w) return { error: "Create a draft first." };
    const v = editSchema.safeParse(Object.fromEntries(form));
    if (!v.success) return { error: v.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    const d = v.data;
    const old = w.content as SiteContent;
    const services = lines(d.services, 9).map((l) => {
      const [title, ...rest] = l.split("|");
      const prev = old.services.find((x) => x.title === title.trim());
      return { title: title.trim(), text: rest.join("|").trim(), source: prev && prev.source !== "placeholder" ? prev.source : /\[\[/.test(title) ? "placeholder" : "member" } as const;
    });
    if (!services.length) return { error: "Add at least one service." };
    const content: SiteContent = {
      ...old, meta: { title: d.meta_title, description: d.meta_description }, brand: { ...old.brand, eyebrow: d.eyebrow },
      hero: { headline: d.headline, sub: d.sub, primary_cta: d.primary_cta, secondary_cta: d.secondary_cta },
      services, features: lines(d.features, 6), steps: lines(d.steps, 4), about: d.about,
    };
    const g = gaps(content);
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
