import "server-only";
import { userClient } from "@/lib/supabase/server";
import type { Campaign } from "@/lib/types";
import { industryKeywords, searchTerms } from "./keywords";
import { scoreDomain } from "./domains";
import { opportunities, parseAudit, scoreProspect, type Audit } from "./prospects";
import { fetchPublicPage } from "./net";

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

/** Loads and parses one home page with the safe fetcher. Failures come back as an audit with an error. */
export async function auditWebsite(url: string): Promise<Audit> {
  try {
    const page = await fetchPublicPage(url, { timeoutMs: 6000 });
    return parseAudit({ url, finalUrl: page.finalUrl, status: page.status, html: page.html, ms: page.ms, bytes: page.bytes });
  } catch (e) {
    const msg = (e as Error).name === "TimeoutError" ? "timed out" : (e as Error).message.slice(0, 120);
    return { url, final_url: url, error: msg } as Audit;
  }
}

/** Saves a website check on a prospect with its evidence row (and a public email found on the page). */
export async function saveAudit(db: Db, c: Pick<Campaign, "id" | "workspace_id">, userId: string, p: { id: string; email: string | null }, a: Audit) {
  const now = new Date().toISOString();
  const found = !p.email && a.emails?.[0];
  await db.from("prospects").update({ audit: a, audited_at: now, updated_by: userId, ...(found ? { email: a.emails[0] } : {}) }).eq("id", p.id);
  const opps = opportunities(a, true);
  const ev = [{
    label: a.error ? "Website check failed" : "Website check",
    value: a.error ? a.error : `HTTP ${a.status}, ${(a.ms / 1000).toFixed(1)} s, ${a.kb} KB. ${opps.length ? `Observed: ${opps.join("; ")}.` : "No common issues observed on the home page."}`,
    source_name: "Domain2Revenue website check", source_url: a.final_url,
  }];
  if (found) ev.push({ label: "Public business email", value: a.emails[0], source_name: "Listed on the business website", source_url: a.final_url });
  await db.from("evidence").insert(ev.map((e) => ({ ...e, workspace_id: c.workspace_id, campaign_id: c.id, prospect_id: p.id, kind: "website_audit", created_by: userId, observed_at: now })));
}
