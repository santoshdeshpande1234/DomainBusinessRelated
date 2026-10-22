"use server";
import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { loadCampaign } from "@/lib/discovery/service";
import { FIELDS, STARTER, UPLIFT_FIELDS, computeModel, type Basis, type Input, type ModelKind } from "@/lib/studio/financial";
import type { StepResult } from "../../../domains/actions";

const BASES: Basis[] = ["actual", "benchmark", "assumption"];
const ALL = [...FIELDS.map((f) => ({ key: f.key, unit: f.unit, label: f.label })), ...UPLIFT_FIELDS.map((f) => ({ key: f.key, unit: f.unit, label: f.label }))];

async function ctx(campaignId: string, prospectId: string) {
  const s = await requirePerm("campaign:write");
  const db = await userClient();
  const c = await loadCampaign(db, campaignId);
  const { data: p } = await db.from("prospects").select("id, website").eq("id", prospectId).eq("campaign_id", c.id).maybeSingle();
  if (!p) throw new Error("Prospect not found.");
  const { data: m } = await db.from("financial_models").select("*").eq("prospect_id", p.id).maybeSingle();
  return { s, db, c, p, m };
}

async function save(db: Awaited<ReturnType<typeof userClient>>, row: { workspace_id: string; campaign_id: string; prospect_id: string }, userId: string, model: ModelKind, inputs: Record<string, Input>, exists: boolean) {
  const r = computeModel(model, inputs);
  const results = r.ok ? { ...r, scenarios: r.scenarios.map(({ cumulative, ...x }) => ({ ...x, cumulative: cumulative.slice(0, 24) })) } : r;
  const body = { model, inputs, results, confidence: r.ok ? r.confidence : null, updated_by: userId };
  const { error } = exists
    ? await db.from("financial_models").update(body).eq("prospect_id", row.prospect_id)
    : await db.from("financial_models").insert({ ...row, ...body, created_by: userId });
  if (error) throw new Error(error.message);
  return r;
}

export async function saveModel(campaignId: string, prospectId: string, _: StepResult | undefined, form: FormData): Promise<StepResult> {
  try {
    const { s, db, c, p, m } = await ctx(campaignId, prospectId);
    const model = form.get("model") === "ecommerce" ? "ecommerce" : "lead_gen";
    const inputs: Record<string, Input> = {};
    const errors: string[] = [];
    for (const f of ALL) {
      const raw = String(form.get(f.key) ?? "").trim().replace(/,/g, "");
      if (!raw) continue;
      const n = Number(raw);
      const isUplift = f.key.endsWith("_traffic") || f.key.endsWith("_conversion");
      if (!Number.isFinite(n) || (isUplift ? n < -90 || n > 1000 : n < 0) || (f.unit === "pct" && !isUplift && n > 100)) { errors.push(`${f.label}: enter a number in range`); continue; }
      const basis = String(form.get(`${f.key}__basis`)) as Basis;
      const src = String(form.get(`${f.key}__src`) ?? "").trim();
      if (!BASES.includes(basis)) { errors.push(`${f.label}: choose where the figure comes from`); continue; }
      if (basis === "benchmark" && !/^https?:\/\/\S+$/.test(src)) { errors.push(`${f.label}: a benchmark needs its source link`); continue; }
      inputs[f.key] = { value: f.unit === "pct" ? n / 100 : n, basis, source_url: src && /^https?:\/\//.test(src) ? src.slice(0, 500) : null, note: src && !/^https?:\/\//.test(src) ? src.slice(0, 200) : null };
    }
    if (errors.length) return { error: errors.slice(0, 4).join("; ") };
    const r = await save(db, { workspace_id: c.workspace_id, campaign_id: c.id, prospect_id: p.id }, s.userId, model, inputs, !!m);
    revalidatePath(`/campaigns/${campaignId}/prospects/${prospectId}/financials`);
    return r.ok ? { ok: "Saved and recalculated." } : { ok: `Saved. Still needed: ${r.missing.join(", ")}.` };
  } catch (e) { return { error: (e as Error).message }; }
}

/** Fills blank scenario and planning inputs with labelled starter assumptions, and costs from the campaign's own prices. */
export async function applyStarter(campaignId: string, prospectId: string) {
  const { s, db, c, p, m } = await ctx(campaignId, prospectId);
  const inputs: Record<string, Input> = { ...((m?.inputs ?? {}) as Record<string, Input>) };
  for (const [k, value] of Object.entries(STARTER)) inputs[k] ??= { value, basis: "assumption", note: "Starter assumption: replace with real figures" };
  const build = p.website ? c.service_pricing?.website_redesign : c.service_pricing?.website_build;
  if (build != null) inputs.implementation_cost ??= { value: Number(build), basis: "actual", note: `Your ${p.website ? "redesign" : "build"} price on this campaign` };
  if (c.service_pricing?.monthly_retainer != null) inputs.monthly_cost ??= { value: Number(c.service_pricing.monthly_retainer), basis: "actual", note: "Your monthly retainer on this campaign" };
  await save(db, { workspace_id: c.workspace_id, campaign_id: c.id, prospect_id: p.id }, s.userId, (m?.model ?? "lead_gen") as ModelKind, inputs, !!m);
  revalidatePath(`/campaigns/${campaignId}/prospects/${prospectId}/financials`);
}
