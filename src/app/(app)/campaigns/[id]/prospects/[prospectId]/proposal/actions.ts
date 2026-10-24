"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePerm } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { loadCampaign } from "@/lib/discovery/service";
import { computeModel, type Input, type ModelKind } from "@/lib/studio/financial";
import type { SiteContent } from "@/lib/studio/site";
import { EMAIL_LIMITS, buildProposal, type EmailDraft, type Pricing, type Proposal, type ProposalCheck } from "@/lib/proposals/proposal";
import type { StepResult } from "../../../domains/actions";

/** Versions kept per proposal; older ones are pruned. */
const KEEP_VERSIONS = 20;

async function ctx(campaignId: string, prospectId: string) {
  const s = await requirePerm("campaign:write");
  const db = await userClient();
  const c = await loadCampaign(db, campaignId);
  const { data: p } = await db.from("prospects").select("*").eq("id", prospectId).eq("campaign_id", c.id).maybeSingle();
  if (!p) throw new Error("Prospect not found.");
  const { data: row } = await db.from("proposals").select("*").eq("prospect_id", p.id).maybeSingle();
  return { s, db, c, p, row };
}
type Ctx = Awaited<ReturnType<typeof ctx>>;

const done = (campaignId: string, prospectId: string) => {
  revalidatePath(`/campaigns/${campaignId}/prospects/${prospectId}/proposal`);
  revalidatePath(`/campaigns/${campaignId}/proposals`);
};

async function snapshot(x: Pick<Ctx, "db" | "c" | "s" | "row">, reason: string) {
  const r = x.row;
  if (!r?.content?.title) return;
  const { data: last } = await x.db.from("proposal_versions").select("version").eq("proposal_id", r.id).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (last?.version ?? 0) + 1;
  const { error } = await x.db.from("proposal_versions").insert({
    workspace_id: x.c.workspace_id, campaign_id: x.c.id, proposal_id: r.id, version, reason: reason.slice(0, 200), content: r.content, emails: r.emails, created_by: x.s.userId,
  });
  if (error) { console.warn("proposal version not saved", { proposal: r.id, code: error.code }); return; }
  if (version > KEEP_VERSIONS) await x.db.from("proposal_versions").delete().eq("proposal_id", r.id).lte("version", version - KEEP_VERSIONS);
}

/** Everything the proposal is built from, scoped to this prospect. */
async function inputs(x: Pick<Ctx, "db" | "c" | "p">) {
  const [{ data: ws }, { data: w }, { data: fm }, { data: names = [] }, { data: comps = [] }] = await Promise.all([
    x.db.from("workspaces").select("company_name, company_website, sender_name, service_pricing").eq("id", x.c.workspace_id).maybeSingle(),
    x.db.from("website_previews").select("content, status, share_enabled, token").eq("prospect_id", x.p.id).maybeSingle(),
    x.db.from("financial_models").select("model, inputs").eq("prospect_id", x.p.id).maybeSingle(),
    x.db.from("prospects").select("name").eq("campaign_id", x.c.id).neq("id", x.p.id),
    x.db.from("competitors").select("name").eq("prospect_id", x.p.id),
  ]);
  const own = (x.c.service_pricing ?? {}) as Pricing;
  const fallback = (ws?.service_pricing ?? {}) as Pricing;
  const price = (k: keyof Pricing) => (own[k] ?? fallback[k] ?? null);
  const content = w?.content as SiteContent | undefined;
  const shared = w && w.status === "ready" && w.share_enabled;
  return {
    business: { name: x.p.name, city: x.p.city, category: x.p.category, website: x.p.website, contact_name: x.p.contact_name, contact_role: x.p.contact_role, email: x.p.email },
    company: { name: ws?.company_name ?? "", website: ws?.company_website || null, sender: ws?.sender_name || null },
    currency: x.c.currency,
    pricing: { website_build: price("website_build"), website_redesign: price("website_redesign"), monthly_retainer: price("monthly_retainer") },
    growth: content?.growth ?? null,
    previewUrl: shared ? `${serverEnv("APP_URL").replace(/\/$/, "")}/preview/${w.token}` : null,
    financial: fm ? computeModel(fm.model as ModelKind, fm.inputs as Record<string, Input>) : null,
    others: [...names!.map((n) => n.name), ...comps!.map((n) => n.name)].filter((n) => n.trim().toLowerCase() !== x.p.name.trim().toLowerCase()),
  };
}

/** Builds (or rebuilds) the proposal and email drafts from the saved research. A version is kept first. */
export async function generateProposal(campaignId: string, prospectId: string): Promise<StepResult> {
  try {
    const x = await ctx(campaignId, prospectId);
    const r = buildProposal(await inputs(x));
    await snapshot(x, "Before rebuild");
    const row = { content: r.proposal, emails: r.emails, checks: r.check, updated_by: x.s.userId, ...(r.check.missing.length && x.row?.status === "ready" ? { status: "draft" } : {}) };
    const { error } = x.row
      ? await x.db.from("proposals").update(row).eq("id", x.row.id)
      : await x.db.from("proposals").insert({ ...row, workspace_id: x.c.workspace_id, campaign_id: x.c.id, prospect_id: x.p.id, created_by: x.s.userId });
    if (error) throw new Error(error.message);
    done(campaignId, prospectId);
    return { ok: r.check.missing.length ? `Proposal ${x.row ? "rebuilt" : "drafted"}. ${r.check.missing.length} item(s) to fill before it can be marked ready.` : `Proposal ${x.row ? "rebuilt" : "drafted"} with three email drafts.` };
  } catch (e) { return { error: (e as Error).message }; }
}

const line = z.string().trim().max(400);
const editSchema = z.object({
  summary: z.string().trim().min(20, "Write at least a sentence.").max(1500),
  next_steps: z.string().max(2000),
  website_amount: z.string().trim().max(20),
  retainer_amount: z.string().trim().max(20),
});
const amount = (v: string) => {
  if (!v) return null;
  const n = Number(v.replace(/[, ]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new Error("Prices must be numbers between 0 and 10,000,000.");
  return n;
};

/** Saves edits to the summary, next steps and prices. */
export async function saveProposal(campaignId: string, prospectId: string, _: StepResult | undefined, form: FormData): Promise<StepResult> {
  try {
    const x = await ctx(campaignId, prospectId);
    if (!x.row) return { error: "Draft the proposal first." };
    const d = editSchema.parse(Object.fromEntries(form));
    const old = x.row.content as Proposal;
    const lines = old.investment.lines.map((l) => ({ ...l, amount: l.key === "website" ? amount(d.website_amount) : l.key === "retainer" ? amount(d.retainer_amount) : l.amount }));
    const pick = (r: "one-time" | "monthly") => { const xs = lines.filter((l) => l.recurring === r).map((l) => l.amount); return xs.some((v) => v == null) ? null : xs.reduce<number>((n, v) => n + (v ?? 0), 0); };
    const one = pick("one-time"), mon = pick("monthly");
    const content: Proposal = {
      ...old, summary: d.summary,
      next_steps: d.next_steps.split("\n").map((s) => line.parse(s)).filter(Boolean).slice(0, 8),
      investment: { ...old.investment, lines, one_time: one, monthly: mon, first_year: one != null && mon != null ? one + 12 * mon : null },
    };
    const checks = x.row.checks as ProposalCheck;
    const missing = (checks.missing ?? []).filter((m) => !/^Price for/.test(m)).concat(lines.filter((l) => l.amount == null).map((l) => `Price for "${l.label}" (campaign or workspace service pricing).`));
    await snapshot(x, "Before edit");
    const { error } = await x.db.from("proposals").update({ content, checks: { ...checks, missing }, updated_by: x.s.userId, ...(missing.length && x.row.status === "ready" ? { status: "draft" } : {}) }).eq("id", x.row.id);
    if (error) throw new Error(error.message);
    done(campaignId, prospectId);
    return { ok: missing.length ? `Saved. ${missing.length} item(s) still to fill.` : "Saved." };
  } catch (e) { return { error: e instanceof z.ZodError ? e.issues[0].message : (e as Error).message }; }
}

/** Saves one email draft. Nothing is sent. */
export async function saveEmail(campaignId: string, prospectId: string, key: string, subject: string, body: string): Promise<StepResult> {
  try {
    const x = await ctx(campaignId, prospectId);
    if (!x.row) return { error: "Draft the proposal first." };
    const s = z.string().trim().min(3).max(EMAIL_LIMITS.subject).parse(subject);
    const b = z.string().trim().min(20).max(EMAIL_LIMITS.body).parse(body);
    const emails = (x.row.emails as EmailDraft[]).map((e) => (e.key === key ? { ...e, subject: s, body: b } : e));
    if (!emails.some((e) => e.key === key)) return { error: "Unknown email." };
    await snapshot(x, "Before email edit");
    const { error } = await x.db.from("proposals").update({ emails, updated_by: x.s.userId }).eq("id", x.row.id);
    if (error) throw new Error(error.message);
    done(campaignId, prospectId);
    return { ok: "Draft saved. Nothing was sent." };
  } catch (e) { return { error: e instanceof z.ZodError ? "Subject needs 3–160 characters and the body 20–4,000." : (e as Error).message }; }
}

export async function setProposalStatus(campaignId: string, prospectId: string, status: string): Promise<StepResult> {
  try {
    const x = await ctx(campaignId, prospectId);
    if (!x.row) return { error: "Draft the proposal first." };
    const st = z.enum(["draft", "ready", "archived"]).parse(status);
    const missing = (x.row.checks as ProposalCheck).missing ?? [];
    if (st === "ready" && missing.length) return { error: `Fill these first: ${missing.join(" ")}` };
    const { error } = await x.db.from("proposals").update({ status: st, updated_by: x.s.userId }).eq("id", x.row.id);
    if (error) throw new Error(error.message);
    done(campaignId, prospectId);
    return { ok: st === "ready" ? "Marked ready." : st === "archived" ? "Archived." : "Back to draft." };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function restoreProposal(campaignId: string, prospectId: string, version: number): Promise<StepResult> {
  try {
    const x = await ctx(campaignId, prospectId);
    if (!x.row) return { error: "Draft the proposal first." };
    const { data: v } = await x.db.from("proposal_versions").select("*").eq("proposal_id", x.row.id).eq("version", z.number().int().positive().parse(version)).maybeSingle();
    if (!v) return { error: "Version not found." };
    await snapshot(x, `Before restoring version ${v.version}`);
    const { error } = await x.db.from("proposals").update({ content: v.content, emails: v.emails, status: "draft", updated_by: x.s.userId }).eq("id", x.row.id);
    if (error) throw new Error(error.message);
    done(campaignId, prospectId);
    return { ok: `Version ${v.version} restored as a draft.` };
  } catch (e) { return { error: (e as Error).message }; }
}
