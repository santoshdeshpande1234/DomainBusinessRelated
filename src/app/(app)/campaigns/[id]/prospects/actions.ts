"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePerm } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { getCredentials, markIntegration } from "@/lib/integrations";
import { searchTerms } from "@/lib/discovery/keywords";
import { PLACES_COST_PER_REQUEST_USD, langCode, searchPlaces } from "@/lib/discovery/places";
import { campaignSpendUsd } from "@/lib/discovery/net";
import { EMAIL_RE, csvRecords, dedupeKey, normalizeWebsite, opportunities, parseCsv } from "@/lib/discovery/prospects";
import { auditWebsite, loadCampaign, prospectBudgetUsd, rescoreProspects } from "@/lib/discovery/service";
import type { StepResult } from "../domains/actions";

const fail = (e: unknown): StepResult => ({ error: (e as Error).message });

async function ctx(campaignId: string) {
  const s = await requirePerm("campaign:write");
  const db = await userClient();
  const c = await loadCampaign(db, campaignId);
  return { s, db, c };
}
const done = (id: string) => revalidatePath(`/campaigns/${id}/prospects`);

type Db = Awaited<ReturnType<typeof userClient>>;
type NewProspect = {
  name: string; category?: string | null; address?: string | null; city?: string | null; region?: string | null; country?: string | null;
  website?: string | null; phone?: string | null; email?: string | null; contact_name?: string | null; contact_role?: string | null; notes?: string | null;
  origin: "google_places" | "csv" | "manual"; origin_ref?: string | null; origin_url?: string | null; listing?: { status: string | null; reviews: number | null; rating?: number | null };
};

/** Inserts prospects that are not already in the campaign (same place id, website host, or name + city). */
async function insertNew(db: Db, c: { id: string; workspace_id: string; max_prospects: number }, userId: string, items: NewProspect[], evidence: (p: NewProspect) => { label: string; value: string; source_name: string; source_url: string | null }) {
  const { data: existing } = await db.from("prospects").select("website_host, origin_ref, dedupe_key").eq("campaign_id", c.id);
  const hosts = new Set(existing?.map((e) => e.website_host).filter(Boolean));
  const refs = new Set(existing?.map((e) => e.origin_ref).filter(Boolean));
  const keys = new Set(existing?.filter((e) => !e.website_host).map((e) => e.dedupe_key));
  // A row without a city matches the same name in any city.
  const names = new Set(existing?.map((e) => e.dedupe_key.split("|")[0]));
  const room = Math.max(0, c.max_prospects - (existing?.length ?? 0));
  const rows: (NewProspect & { website_host: string | null; dedupe_key: string })[] = [];
  let dupes = 0;
  for (const p of items) {
    const w = normalizeWebsite(p.website);
    const key = dedupeKey(p.name, p.city);
    if ((p.origin_ref && refs.has(p.origin_ref)) || (w && hosts.has(w.host)) || (!w && (keys.has(key) || (!p.city && names.has(key.split("|")[0]))))) { dupes++; continue; }
    if (rows.length >= room) break;
    if (w) hosts.add(w.host); else keys.add(key);
    names.add(key.split("|")[0]);
    if (p.origin_ref) refs.add(p.origin_ref);
    rows.push({ ...p, website: w?.url ?? null, website_host: w?.host ?? null, dedupe_key: key, email: p.email && EMAIL_RE.test(p.email) ? p.email.toLowerCase() : null });
  }
  if (!rows.length) return { added: 0, dupes, full: room === 0 };
  const { data, error } = await db.from("prospects").insert(rows.map(({ listing, ...r }) => ({
    ...r, workspace_id: c.workspace_id, campaign_id: c.id, created_by: userId, updated_by: userId,
    score_detail: listing ? { listing_status: listing.status, reviews: listing.reviews, rating: listing.rating ?? null } : {},
  }))).select("id, name, website, phone, email, city, address, origin_url, contact_name");
  if (error) throw new Error(error.message);
  const ev = data!.map((p, i) => ({ ...evidence(rows[i]), workspace_id: c.workspace_id, campaign_id: c.id, prospect_id: p.id, kind: "listing", created_by: userId }));
  if (ev.length) await db.from("evidence").insert(ev);
  return { added: data!.length, dupes, full: rows.length >= room };
}

/** One Google Places page per call; the search position is kept on the campaign so it resumes. */
export async function searchProspects(campaignId: string): Promise<StepResult> {
  try {
    const { s, db, c } = await ctx(campaignId);
    const creds = await getCredentials(c.workspace_id, "google_places");
    if (!creds?.api_key) return { error: "Connect Google Places in Settings → Integrations first, or import a CSV." };
    const terms = searchTerms(c.industry, c.custom_industry);
    if (!terms.length) return { error: "This campaign has no search terms. Set a custom industry name." };
    const st = (c.progress?.places ?? { term: 0, token: null, done: false }) as { term: number; token: string | null; done: boolean };
    if (st.done) return { ok: "Every search term has been covered. Add a CSV for more businesses.", remaining: 0 };
    const { count } = await db.from("prospects").select("id", { count: "exact", head: true }).eq("campaign_id", c.id);
    if ((count ?? 0) >= c.max_prospects) return { ok: `Reached this campaign's limit of ${c.max_prospects} prospects.`, remaining: 0 };
    const budget = prospectBudgetUsd(c);
    const spent = await campaignSpendUsd(c.id);
    if (spent + PLACES_COST_PER_REQUEST_USD > budget + 1e-9) {
      const capped = c.limits?.max_api_spend_usd != null && Number(c.limits.max_api_spend_usd) < Number(c.prospect_budget) * Number(c.fx.usd_per_unit);
      return { error: capped
        ? `The campaign's "Max API spend" limit is $${Number(c.limits.max_api_spend_usd).toFixed(2)} and $${spent.toFixed(2)} is estimated so far. Raise it, or clear it to use the prospect budget, by editing the campaign.`
        : `The prospect budget (about $${budget.toFixed(2)}) is used up: $${spent.toFixed(2)} estimated so far. Raise it on the campaign to continue.` };
    }

    const where = [c.service_area || c.city, c.region, c.country].filter(Boolean).join(", ");
    const query = `${terms[st.term]} in ${where}`;
    let found;
    try {
      found = await searchPlaces(creds.api_key, query, st.token, langCode(c.language), { workspaceId: c.workspace_id, campaignId: c.id, userId: s.userId });
    } catch (e) {
      if (/api key|permission|denied|billing/i.test((e as Error).message)) await markIntegration(c.workspace_id, "google_places", "failed");
      throw e;
    }
    const { value, hit } = found;
    if (!hit) await markIntegration(c.workspace_id, "google_places", "verified");
    const now = new Date().toISOString();
    const r = await insertNew(db, c, s.userId, value.places.map((p) => ({
      name: p.name, category: p.category, address: p.address, city: p.city, region: p.region, country: p.country, website: p.website, phone: p.phone,
      origin: "google_places" as const, origin_ref: p.id, origin_url: p.mapsUrl, listing: { status: p.status, reviews: p.reviews, rating: p.rating },
    })), (p) => ({
      label: "Business listing", source_name: "Google Maps", source_url: p.origin_url ?? null,
      value: [p.name, p.address, p.phone, p.website && `website ${p.website}`, p.listing?.reviews != null && `${p.listing.reviews} reviews`, p.listing?.status && p.listing.status !== "OPERATIONAL" && p.listing.status.toLowerCase().replace(/_/g, " ")].filter(Boolean).join(" · "),
    }));
    const next = value.next ? { term: st.term, token: value.next, done: false } : st.term + 1 < terms.length ? { term: st.term + 1, token: null, done: false } : { term: st.term, token: null, done: true };
    await db.from("campaigns").update({ progress: { ...c.progress, places: { ...next, last_run: now } } }).eq("id", c.id);
    await rescoreProspects(db, c, s.userId);
    done(campaignId);
    const more = !next.done && !r.full;
    return { ok: `"${query}": ${r.added} added, ${r.dupes} duplicate(s) skipped${hit ? " (cached result, no charge)" : ""}.`, remaining: more ? 1 : 0 };
  } catch (e) { return fail(e); }
}

export async function importCsv(campaignId: string, _: StepResult | undefined, form: FormData): Promise<StepResult> {
  try {
    const { s, db, c } = await ctx(campaignId);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
    if (file.size > 1_000_000) return { error: "CSV files can be up to 1 MB." };
    const { records, unknown } = csvRecords(parseCsv(await file.text()));
    const valid = records.filter((r) => r.name);
    if (!valid.length) return { error: "No rows with a \"name\" column were found." };
    if (valid.length > 1000) return { error: "Import up to 1,000 rows at a time." };
    const r = await insertNew(db, c, s.userId, valid.map((x) => ({ ...x, name: x.name!, origin: "csv" as const })), (p) => ({
      label: "Imported from CSV", source_name: `CSV import (${file.name.slice(0, 60)})`, source_url: null,
      value: [p.name, p.website, p.phone, p.email, p.contact_name && `${p.contact_name}${p.contact_role ? `, ${p.contact_role}` : ""}`].filter(Boolean).join(" · "),
    }));
    await rescoreProspects(db, c, s.userId);
    done(campaignId);
    return { ok: `${r.added} imported, ${r.dupes} duplicate(s) skipped${valid.length - r.added - r.dupes > 0 ? `, ${valid.length - r.added - r.dupes} over the campaign limit` : ""}${records.length > valid.length ? `, ${records.length - valid.length} without a name` : ""}${unknown.length ? `. Ignored columns: ${unknown.join(", ")}` : ""}.` };
  } catch (e) { return fail(e); }
}

/** Audits a few websites per call with the app's own checker; results and evidence are saved per prospect. */
export async function auditProspects(campaignId: string): Promise<StepResult> {
  try {
    const { s, db, c } = await ctx(campaignId);
    const { data: batch } = await db.from("prospects").select("id, website, email").eq("campaign_id", c.id).not("website", "is", null)
      .is("audited_at", null).neq("status", "excluded").order("score", { ascending: false, nullsFirst: false }).limit(4);
    const results = await Promise.all((batch ?? []).map(async (p) => ({ p, a: await auditWebsite(p.website!) })));
    const now = new Date().toISOString();
    for (const { p, a } of results) {
      const found = !p.email && a.emails?.[0];
      await db.from("prospects").update({ audit: a, audited_at: now, updated_by: s.userId, ...(found ? { email: a.emails[0] } : {}) }).eq("id", p.id);
      const opps = opportunities(a, true);
      const ev = [{
        label: a.error ? "Website check failed" : "Website check",
        value: a.error ? a.error : `HTTP ${a.status}, ${(a.ms / 1000).toFixed(1)} s, ${a.kb} KB. ${opps.length ? `Observed: ${opps.join("; ")}.` : "No common issues observed on the home page."}`,
        source_name: "Domain2Revenue website check", source_url: a.final_url,
      }];
      if (found) ev.push({ label: "Public business email", value: a.emails[0], source_name: "Listed on the business website", source_url: a.final_url });
      await db.from("evidence").insert(ev.map((e) => ({ ...e, workspace_id: c.workspace_id, campaign_id: c.id, prospect_id: p.id, kind: "website_audit", created_by: s.userId, observed_at: now })));
    }
    await rescoreProspects(db, c, s.userId);
    const { count } = await db.from("prospects").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).not("website", "is", null).is("audited_at", null).neq("status", "excluded");
    done(campaignId);
    return { ok: `Checked ${results.length} website(s)${results.some((r) => r.a.error) ? `, ${results.filter((r) => r.a.error).length} could not be loaded` : ""}.`, remaining: count ?? 0 };
  } catch (e) { return fail(e); }
}

export async function setProspectStatus(campaignId: string, ids: string[], status: string): Promise<StepResult> {
  try {
    const { s, db, c } = await ctx(campaignId);
    const st = z.enum(["new", "selected", "excluded"]).parse(status);
    const list = z.array(z.string().uuid()).max(1000).parse(ids);
    if (!list.length) return { error: "Select at least one prospect." };
    const { error } = await db.from("prospects").update({ status: st, updated_by: s.userId }).in("id", list).eq("campaign_id", c.id);
    if (error) throw new Error(error.message);
    done(campaignId);
    return { ok: `${list.length} prospect(s) ${st === "new" ? "restored" : st}.` };
  } catch (e) { return fail(e); }
}

const editSchema = z.object({
  contact_name: z.string().trim().max(120).optional(), contact_role: z.string().trim().max(120).optional(),
  email: z.string().trim().toLowerCase().regex(EMAIL_RE, "Enter a valid email").or(z.literal("")).optional(),
  phone: z.string().trim().max(40).optional(), notes: z.string().trim().max(2000).optional(),
  source_url: z.string().trim().url().refine((u) => /^https?:\/\//.test(u), "Use a web address").or(z.literal("")).optional(),
});

/** Manual research. Contact details need a source so every fact stays traceable. */
export async function updateProspect(campaignId: string, prospectId: string, _: StepResult | undefined, form: FormData): Promise<StepResult> {
  try {
    const { s, db, c } = await ctx(campaignId);
    const p = editSchema.safeParse(Object.fromEntries(form));
    if (!p.success) return { error: p.error.issues.map((i) => i.message).join("; ") };
    const { data: cur } = await db.from("prospects").select("contact_name, contact_role, email, phone").eq("id", prospectId).eq("campaign_id", c.id).single();
    if (!cur) return { error: "Prospect not found." };
    const changed = (["contact_name", "contact_role", "email", "phone"] as const).filter((k) => (p.data[k] || null) !== (cur[k] || null));
    if (changed.length && !p.data.source_url) return { error: "Add the page where you found these contact details." };
    const { error } = await db.from("prospects").update({
      contact_name: p.data.contact_name || null, contact_role: p.data.contact_role || null, email: p.data.email || null,
      phone: p.data.phone || null, notes: p.data.notes || null, updated_by: s.userId,
    }).eq("id", prospectId).eq("campaign_id", c.id);
    if (error) throw new Error(error.message);
    if (changed.length) {
      await db.from("evidence").insert({
        workspace_id: c.workspace_id, campaign_id: c.id, prospect_id: prospectId, kind: "manual", created_by: s.userId,
        label: "Contact details recorded", value: changed.map((k) => `${k.replace("_", " ")}: ${p.data[k] || "removed"}`).join(" · "),
        source_name: new URL(p.data.source_url!).hostname, source_url: p.data.source_url,
      });
    }
    await rescoreProspects(db, c, s.userId, [prospectId]);
    revalidatePath(`/campaigns/${campaignId}/prospects/${prospectId}`);
    done(campaignId);
    return { ok: "Saved." };
  } catch (e) { return fail(e); }
}

export async function reauditProspect(campaignId: string, prospectId: string) {
  const { s, db } = await ctx(campaignId);
  await db.from("prospects").update({ audited_at: null, updated_by: s.userId }).eq("id", prospectId).eq("campaign_id", campaignId);
  await auditProspects(campaignId);
  revalidatePath(`/campaigns/${campaignId}/prospects/${prospectId}`);
}
