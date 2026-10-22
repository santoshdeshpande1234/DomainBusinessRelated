"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePerm } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { getCredentials, markIntegration } from "@/lib/integrations";
import { searchTerms } from "@/lib/discovery/keywords";
import { PLACES_COST_PER_REQUEST_USD, langCode, searchPlaces } from "@/lib/discovery/places";
import { campaignSpendUsd } from "@/lib/discovery/net";
import { normalizeWebsite } from "@/lib/discovery/prospects";
import { auditWebsite, loadCampaign, prospectBudgetUsd } from "@/lib/discovery/service";
import type { StepResult } from "../../../domains/actions";

const MAX_COMPETITORS = 8;
const fail = (e: unknown): StepResult => ({ error: (e as Error).message });

async function ctx(campaignId: string, prospectId: string) {
  const s = await requirePerm("campaign:write");
  const db = await userClient();
  const c = await loadCampaign(db, campaignId);
  const { data: p } = await db.from("prospects").select("*").eq("id", prospectId).eq("campaign_id", c.id).maybeSingle();
  if (!p) throw new Error("Prospect not found.");
  const { data: existing } = await db.from("competitors").select("website_host, origin_ref").eq("prospect_id", p.id);
  return { s, db, c, p, existing: existing ?? [] };
}
const done = (campaignId: string, prospectId: string) => revalidatePath(`/campaigns/${campaignId}/prospects/${prospectId}/competitors`);

const sameText = (a: string | null, b: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Free: uses businesses this campaign already found, preferring the same category and city. */
export async function competitorsFromCampaign(campaignId: string, prospectId: string): Promise<StepResult> {
  try {
    const { s, db, c, p, existing } = await ctx(campaignId, prospectId);
    const room = MAX_COMPETITORS - existing.length;
    if (room <= 0) return { ok: `Already comparing ${MAX_COMPETITORS} competitors. Remove one to add another.` };
    const { data: pool } = await db.from("prospects").select("*").eq("campaign_id", c.id).neq("id", p.id).neq("status", "excluded");
    const hosts = new Set(existing.map((e) => e.website_host).filter(Boolean));
    const refs = new Set(existing.map((e) => e.origin_ref).filter(Boolean));
    const rank = (x: NonNullable<typeof pool>[number]) => (sameText(x.category, p.category) ? 2 : 0) + (sameText(x.city, p.city) ? 1 : 0);
    const picks = (pool ?? [])
      .filter((x) => !(x.website_host && (hosts.has(x.website_host) || x.website_host === p.website_host)) && !refs.has(`prospect:${x.id}`))
      .filter((x) => rank(x) >= 2 || (!p.category && rank(x) >= 1))
      .sort((a, b) => rank(b) - rank(a) || (b.score_detail?.reviews ?? 0) - (a.score_detail?.reviews ?? 0))
      .slice(0, Math.min(room, 5));
    if (!picks.length) return { ok: "No other business in this campaign shares this one's category. Search Google Maps or add one by hand." };
    const { error } = await db.from("competitors").insert(picks.map((x) => ({
      workspace_id: c.workspace_id, campaign_id: c.id, prospect_id: p.id, name: x.name, category: x.category, address: x.address, city: x.city,
      website: x.website, website_host: x.website_host, phone: x.phone, reviews: x.score_detail?.reviews ?? null, rating: x.score_detail?.rating ?? null,
      origin: "campaign", origin_ref: `prospect:${x.id}`, origin_url: x.origin_url, audit: x.audit, audited_at: x.audited_at, created_by: s.userId,
      detail: { reason: [sameText(x.category, p.category) && "same category", sameText(x.city, p.city) && "same city"].filter(Boolean).join(", ") },
    })));
    if (error) throw new Error(error.message);
    done(campaignId, prospectId);
    return { ok: `Added ${picks.length} competitor(s) from this campaign.` };
  } catch (e) { return fail(e); }
}

/** One Google Maps search for the prospect's category and city. Cached; counts against the campaign's budget. */
export async function competitorsFromPlaces(campaignId: string, prospectId: string): Promise<StepResult> {
  try {
    const { s, db, c, p, existing } = await ctx(campaignId, prospectId);
    const room = MAX_COMPETITORS - existing.length;
    if (room <= 0) return { ok: `Already comparing ${MAX_COMPETITORS} competitors. Remove one to add another.` };
    const creds = await getCredentials(c.workspace_id, "google_places");
    if (!creds?.api_key) return { error: "Connect Google Places in Settings → Integrations first." };
    const budget = prospectBudgetUsd(c);
    const spent = await campaignSpendUsd(c.id);
    if (spent + PLACES_COST_PER_REQUEST_USD > budget + 1e-9) return { error: `This campaign's research budget (about $${budget.toFixed(2)}) is used up: $${spent.toFixed(2)} estimated so far.` };

    const what = p.category ?? searchTerms(c.industry, c.custom_industry)[0];
    const where = [p.city ?? c.service_area ?? c.city, p.region ?? c.region, p.country ?? c.country].filter(Boolean).join(", ");
    if (!what) return { error: "This business has no category to search for." };
    const query = `${what} in ${where}`;
    const { value, hit } = await searchPlaces(creds.api_key, query, null, langCode(c.language), { workspaceId: c.workspace_id, campaignId: c.id, userId: s.userId })
      .catch(async (e) => { if (/api key|permission|denied|billing/i.test((e as Error).message)) await markIntegration(c.workspace_id, "google_places", "failed"); throw e; });
    const seen = new Date().toISOString();

    // Where the prospect itself appears in the same results is a measurable visibility fact.
    const ownRank = value.places.findIndex((x) => x.id === p.origin_ref || (p.website_host && normalizeWebsite(x.website)?.host === p.website_host));
    await db.from("evidence").insert({
      workspace_id: c.workspace_id, campaign_id: c.id, prospect_id: p.id, kind: "visibility", created_by: s.userId, observed_at: seen,
      label: "Google Maps search position", source_name: "Google Maps (Places API)", detail: { query, rank: ownRank === -1 ? null : ownRank + 1, results: value.places.length },
      value: ownRank === -1 ? `Not in the top ${value.places.length} results for "${query}"` : `Position ${ownRank + 1} of ${value.places.length} for "${query}"`,
      source_url: `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
    });

    const hosts = new Set([...existing.map((e) => e.website_host), p.website_host].filter(Boolean));
    const refs = new Set([...existing.map((e) => e.origin_ref), p.origin_ref].filter(Boolean));
    const rows = [];
    for (const [i, x] of value.places.entries()) {
      if (rows.length >= Math.min(room, 5)) break;
      const w = normalizeWebsite(x.website);
      if (refs.has(x.id) || (w && hosts.has(w.host)) || (x.status && x.status !== "OPERATIONAL")) continue;
      if (w) hosts.add(w.host);
      refs.add(x.id);
      rows.push({
        workspace_id: c.workspace_id, campaign_id: c.id, prospect_id: p.id, name: x.name, category: x.category, address: x.address, city: x.city,
        website: w?.url ?? null, website_host: w?.host ?? null, phone: x.phone, reviews: x.reviews, rating: x.rating,
        origin: "google_places", origin_ref: x.id, origin_url: x.mapsUrl, created_by: s.userId, detail: { query, rank: i + 1, seen_at: seen },
      });
    }
    if (rows.length) { const { error } = await db.from("competitors").insert(rows); if (error) throw new Error(error.message); }
    if (!hit) await markIntegration(c.workspace_id, "google_places", "verified");
    done(campaignId, prospectId);
    return { ok: `"${query}": ${rows.length} competitor(s) added${hit ? " (cached result, no charge)" : ""}.` };
  } catch (e) { return fail(e); }
}

const manual = z.object({
  name: z.string().trim().min(1, "Enter a name").max(200),
  website: z.string().trim().max(300).optional(),
  source_url: z.string().trim().url("Add where you found this business").refine((u) => /^https?:\/\//.test(u), "Use a web address"),
});

export async function addCompetitor(campaignId: string, prospectId: string, _: StepResult | undefined, form: FormData): Promise<StepResult> {
  try {
    const { s, db, c, p, existing } = await ctx(campaignId, prospectId);
    if (existing.length >= MAX_COMPETITORS) return { error: `Up to ${MAX_COMPETITORS} competitors per business.` };
    const v = manual.safeParse(Object.fromEntries(form));
    if (!v.success) return { error: v.error.issues.map((i) => i.message).join("; ") };
    const w = normalizeWebsite(v.data.website);
    if (v.data.website && !w) return { error: "That website address isn't valid." };
    if (w && (w.host === p.website_host || existing.some((e) => e.website_host === w.host))) return { error: "That website is already in this comparison." };
    const { error } = await db.from("competitors").insert({
      workspace_id: c.workspace_id, campaign_id: c.id, prospect_id: p.id, name: v.data.name, website: w?.url ?? null, website_host: w?.host ?? null,
      origin: "manual", origin_url: v.data.source_url, created_by: s.userId, detail: {},
    });
    if (error) throw new Error(error.message);
    done(campaignId, prospectId);
    return { ok: "Added." };
  } catch (e) { return fail(e); }
}

export async function removeCompetitor(campaignId: string, prospectId: string, competitorId: string) {
  const { db } = await ctx(campaignId, prospectId);
  await db.from("competitors").delete().eq("id", z.string().uuid().parse(competitorId)).eq("prospect_id", prospectId);
  done(campaignId, prospectId);
}

/** Checks up to four websites per call: the prospect's own (if not yet checked) and its competitors'. */
export async function auditCompetitors(campaignId: string, prospectId: string): Promise<StepResult> {
  try {
    const { s, db, c, p } = await ctx(campaignId, prospectId);
    const { data: todo } = await db.from("competitors").select("id, website").eq("prospect_id", p.id).not("website", "is", null).is("audited_at", null).limit(4);
    const now = new Date().toISOString();
    const own = p.website && !p.audited_at ? auditWebsite(p.website) : null;
    const results = await Promise.all((todo ?? []).map(async (x) => ({ x, a: await auditWebsite(x.website!) })));
    for (const { x, a } of results) await db.from("competitors").update({ audit: a, audited_at: now }).eq("id", x.id);
    if (own) {
      const a = await own;
      await db.from("prospects").update({ audit: a, audited_at: now, updated_by: s.userId }).eq("id", p.id);
      await db.from("evidence").insert({ workspace_id: c.workspace_id, campaign_id: c.id, prospect_id: p.id, kind: "website_audit", created_by: s.userId, observed_at: now,
        label: a.error ? "Website check failed" : "Website check", value: a.error ?? `HTTP ${a.status}, ${(a.ms / 1000).toFixed(1)} s, ${a.kb} KB.`, source_name: "Domain2Revenue website check", source_url: a.final_url });
    }
    const { count } = await db.from("competitors").select("id", { count: "exact", head: true }).eq("prospect_id", p.id).not("website", "is", null).is("audited_at", null);
    done(campaignId, prospectId);
    const failed = results.filter((r) => r.a.error).length;
    return { ok: `Checked ${results.length + (own ? 1 : 0)} website(s)${failed ? `, ${failed} could not be loaded` : ""}.`, remaining: count ?? 0 };
  } catch (e) { return fail(e); }
}

export async function recheckCompetitors(campaignId: string, prospectId: string) {
  const { db } = await ctx(campaignId, prospectId);
  await db.from("competitors").update({ audited_at: null }).eq("prospect_id", prospectId);
  done(campaignId, prospectId);
}
