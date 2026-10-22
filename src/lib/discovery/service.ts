import "server-only";
import { userClient } from "@/lib/supabase/server";
import type { Campaign } from "@/lib/types";
import { industryKeywords, searchTerms } from "./keywords";
import { scoreDomain } from "./domains";
import { scoreProspect, type Audit } from "./prospects";

type Db = Awaited<ReturnType<typeof userClient>>;

export async function loadCampaign(db: Db, id: string) {
  const { data } = await db.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("Campaign not found.");
  return data as Campaign;
}

/** Recomputes every domain score in a campaign from stored facts. Cheap and deterministic. */
export async function rescoreDomains(db: Db, c: Campaign, userId: string) {
  const [{ data: domains }, { data: comps }] = await Promise.all([
    db.from("domains").select("*").eq("campaign_id", c.id),
    db.from("evidence").select("domain_id, detail").eq("campaign_id", c.id).eq("kind", "comparable_sale"),
  ]);
  const words = industryKeywords(c.industry, c.custom_industry);
  const rows = (domains ?? []).map((d) => {
    const comparables = (comps ?? []).filter((e) => e.domain_id === d.id).map((e) => Number(e.detail.price)).filter(Number.isFinite);
    const r = scoreDomain({
      name: d.name, tld: d.tld, keywords: d.keywords, industryWords: words, city: c.city, region: c.region, country: c.country,
      registryStatus: d.registry_status, price: d.price == null ? null : Number(d.price), renewal: d.renewal_price == null ? null : Number(d.renewal_price),
      budgetPerDomain: Number(c.domain_budget) || null, comparables,
    });
    return { ...d, score: r.score, confidence: r.confidence, score_detail: { components: r.components, flags: r.flags } };
  });
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from("domains").upsert(rows.slice(i, i + 200).map((r) => ({ ...r, updated_by: userId })));
    if (error) throw new Error(error.message);
  }
}

export async function rescoreProspects(db: Db, c: Campaign, userId: string, ids?: string[]) {
  let q = db.from("prospects").select("*").eq("campaign_id", c.id);
  if (ids) q = q.in("id", ids);
  const [{ data: prospects }, { data: ev }] = await Promise.all([
    q, db.from("evidence").select("prospect_id").eq("campaign_id", c.id).not("prospect_id", "is", null),
  ]);
  const counts = new Map<string, number>();
  for (const e of ev ?? []) counts.set(e.prospect_id, (counts.get(e.prospect_id) ?? 0) + 1);
  const words = industryKeywords(c.industry, c.custom_industry);
  const terms = searchTerms(c.industry, c.custom_industry);
  const rows = (prospects ?? []).map((p) => {
    const r = scoreProspect({
      name: p.name, category: p.category, city: p.city, campaignCity: c.city, status: p.score_detail?.listing_status ?? null,
      website: p.website, phone: p.phone, email: p.email, contactName: p.contact_name, reviews: p.score_detail?.reviews ?? null,
      audit: p.audit as Audit | null, evidenceCount: counts.get(p.id) ?? 0, industryWords: words, searchTerms: terms,
    });
    return { ...p, score: r.score, confidence: r.confidence, updated_by: userId,
      score_detail: { ...p.score_detail, components: r.components, flags: r.flags } };
  });
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from("prospects").upsert(rows.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
}

/** USD the campaign allows for paid prospect lookups: the prospect budget, capped by the campaign's API limit. */
export function prospectBudgetUsd(c: Campaign) {
  const budget = Number(c.prospect_budget) * Number(c.fx.usd_per_unit);
  const cap = c.limits?.max_api_spend_usd;
  return cap != null ? Math.min(budget, Number(cap)) : budget;
}
