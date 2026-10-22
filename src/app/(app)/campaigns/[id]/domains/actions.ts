"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePerm } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { DOMAIN_RE, generateIdeas, splitDomain } from "@/lib/discovery/domains";
import { industryKeywords } from "@/lib/discovery/keywords";
import { checkRegistry } from "@/lib/discovery/rdap";
import { loadCampaign, rescoreDomains } from "@/lib/discovery/service";

export type StepResult = { ok?: string; error?: string; remaining?: number };
const fail = (e: unknown): StepResult => ({ error: (e as Error).message });

async function ctx(campaignId: string) {
  const s = await requirePerm("campaign:write");
  const db = await userClient();
  const c = await loadCampaign(db, campaignId);
  return { s, db, c };
}

const done = (campaignId: string) => revalidatePath(`/campaigns/${campaignId}/domains`);

export async function generateDomains(campaignId: string): Promise<StepResult> {
  try {
    const { s, db, c } = await ctx(campaignId);
    const words = industryKeywords(c.industry, c.custom_industry);
    if (!words.length) return { error: "Add a custom industry with at least one word of 3+ letters to generate ideas." };
    const limit = Math.min(150, Math.max(10, c.limits?.max_domains ? c.limits.max_domains * 4 : 60));
    const ideas = generateIdeas({ keywords: words, city: c.city, region: c.region, extensions: c.extensions, limit });
    const { data, error } = await db.from("domains").upsert(
      ideas.map((i) => ({ workspace_id: c.workspace_id, campaign_id: c.id, name: i.name, tld: i.tld, origin: "generated", keywords: i.keywords, created_by: s.userId, updated_by: s.userId })),
      { onConflict: "campaign_id,name", ignoreDuplicates: true },
    ).select("id");
    if (error) throw new Error(error.message);
    await rescoreDomains(db, c, s.userId);
    done(campaignId);
    return { ok: `${data?.length ?? 0} new idea(s) added. Check the registry to see which are free.` };
  } catch (e) { return fail(e); }
}

export async function addDomains(campaignId: string, _: StepResult | undefined, form: FormData): Promise<StepResult> {
  try {
    const { s, db, c } = await ctx(campaignId);
    const raw = String(form.get("names") ?? "").split(/[\s,;]+/).filter(Boolean);
    const valid = [...new Map(raw.map(splitDomain).flatMap((d) => (d && DOMAIN_RE.test(d.sld + d.tld) ? [[d.sld + d.tld, { name: d.sld + d.tld, tld: d.tld }] as const] : []))).values()];
    if (!valid.length) return { error: "Enter at least one full domain name, such as example.com." };
    if (valid.length > 50) return { error: "Add up to 50 domains at a time." };
    const { data, error } = await db.from("domains").upsert(
      valid.map((d) => ({ workspace_id: c.workspace_id, campaign_id: c.id, name: d.name, tld: d.tld, origin: "manual", created_by: s.userId, updated_by: s.userId })),
      { onConflict: "campaign_id,name", ignoreDuplicates: true },
    ).select("id");
    if (error) throw new Error(error.message);
    await rescoreDomains(db, c, s.userId);
    done(campaignId);
    return { ok: `${data?.length ?? 0} domain(s) added${raw.length > valid.length ? `; ${raw.length - valid.length} skipped as invalid` : ""}.` };
  } catch (e) { return fail(e); }
}

/** Checks a small batch per call (keeps each request short); the page calls it until nothing remains. */
export async function checkDomains(campaignId: string): Promise<StepResult> {
  try {
    const { s, db, c } = await ctx(campaignId);
    const { data: batch } = await db.from("domains").select("id, name").eq("campaign_id", c.id)
      .in("registry_status", ["unchecked"]).neq("status", "rejected").order("score", { ascending: false, nullsFirst: false }).limit(6);
    const cx = { workspaceId: c.workspace_id, campaignId: c.id, userId: s.userId };
    const results = await Promise.all((batch ?? []).map(async (d) => ({ d, r: await checkRegistry(d.name, cx) })));
    for (const { d, r } of results) {
      await db.from("domains").update({ registry_status: r.status, registry_checked_at: r.checked_at, registry_source: r.source, updated_by: s.userId }).eq("id", d.id);
      if (r.status !== "error") {
        await db.from("evidence").insert({
          workspace_id: c.workspace_id, campaign_id: c.id, domain_id: d.id, kind: "registry", created_by: s.userId,
          label: "Registry status", value: { registered: "Registered", unregistered: "No registry record", unsupported: "Registry has no public lookup" }[r.status],
          detail: { registrar: r.registrar, created: r.created, expires: r.expires, error: r.error }, source_name: "RDAP", source_url: r.source, observed_at: r.checked_at,
        });
      }
    }
    await rescoreDomains(db, c, s.userId);
    const { count } = await db.from("domains").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("registry_status", "unchecked").neq("status", "rejected");
    const errors = results.filter((x) => x.r.status === "error").length;
    done(campaignId);
    return { remaining: count ?? 0, ok: `Checked ${results.length}${errors ? `, ${errors} failed (try again later)` : ""}.` };
  } catch (e) { return fail(e); }
}

export async function recheckDomain(campaignId: string, domainId: string) {
  const { s, db } = await ctx(campaignId);
  await db.from("domains").update({ registry_status: "unchecked", updated_by: s.userId }).eq("id", domainId).eq("campaign_id", campaignId);
  await checkDomains(campaignId);
  revalidatePath(`/campaigns/${campaignId}/domains/${domainId}`);
}

const statusSchema = z.enum(["candidate", "shortlisted", "approved", "rejected"]);

export async function setDomainStatus(campaignId: string, ids: string[], status: string): Promise<StepResult> {
  try {
    const { s, db, c } = await ctx(campaignId);
    const st = statusSchema.parse(status);
    const list = z.array(z.string().uuid()).max(500).parse(ids);
    if (!list.length) return { error: "Select at least one domain." };
    if (st === "shortlisted" && c.limits?.max_domains) {
      const { count } = await db.from("domains").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).in("status", ["shortlisted", "approved"]).not("id", "in", `(${list.join(",")})`);
      if ((count ?? 0) + list.length > c.limits.max_domains) return { error: `This campaign allows ${c.limits.max_domains} shortlisted domains.` };
    }
    const { error } = await db.from("domains").update({ status: st, updated_by: s.userId }).in("id", list).eq("campaign_id", c.id);
    if (error) throw new Error(error.message);
    done(campaignId);
    for (const id of list) revalidatePath(`/campaigns/${campaignId}/domains/${id}`);
    return { ok: `${list.length} domain(s) marked ${st}.` };
  } catch (e) { return fail(e); }
}

const money = z.coerce.number().min(0).max(100_000_000);
const httpsUrl = z.string().trim().url().refine((u) => /^https?:\/\//.test(u), "Use a web address");

const comparableSchema = z.object({
  sold_name: z.string().trim().toLowerCase().regex(DOMAIN_RE, "Enter a domain name"),
  price: money, sold_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"), source_url: httpsUrl, venue: z.string().trim().max(80).optional(),
});

export async function addComparable(campaignId: string, domainId: string, _: StepResult | undefined, form: FormData): Promise<StepResult> {
  try {
    const { s, db, c } = await ctx(campaignId);
    const p = comparableSchema.safeParse(Object.fromEntries(form));
    if (!p.success) return { error: p.error.issues.map((i) => `${i.path[0]}: ${i.message}`).join("; ") };
    const { error } = await db.from("evidence").insert({
      workspace_id: c.workspace_id, campaign_id: c.id, domain_id: domainId, kind: "comparable_sale", created_by: s.userId,
      label: `Comparable sale: ${p.data.sold_name}`, value: `${p.data.price} ${c.currency}`,
      detail: { domain: p.data.sold_name, price: p.data.price, currency: c.currency, sold_on: p.data.sold_on, venue: p.data.venue },
      source_name: p.data.venue || new URL(p.data.source_url).hostname, source_url: p.data.source_url, observed_at: new Date(p.data.sold_on).toISOString(),
    });
    if (error) throw new Error(error.message);
    await rescoreDomains(db, c, s.userId);
    revalidatePath(`/campaigns/${campaignId}/domains/${domainId}`);
    done(campaignId);
    return { ok: "Comparable added." };
  } catch (e) { return fail(e); }
}

const priceSchema = z.object({ price: money, renewal_price: money, source_url: httpsUrl, note: z.string().trim().max(300).optional() });

/** Manual verification: the user checked a registrar or marketplace and records what it showed. */
export async function recordPrice(campaignId: string, domainId: string, _: StepResult | undefined, form: FormData): Promise<StepResult> {
  try {
    const { s, db, c } = await ctx(campaignId);
    const p = priceSchema.safeParse(Object.fromEntries(form));
    if (!p.success) return { error: p.error.issues.map((i) => `${i.path[0]}: ${i.message}`).join("; ") };
    const now = new Date().toISOString();
    const source = new URL(p.data.source_url).hostname;
    const { error } = await db.from("domains").update({
      price: p.data.price, renewal_price: p.data.renewal_price, price_currency: c.currency, price_source: `Manual check on ${source}`, price_checked_at: now, updated_by: s.userId,
    }).eq("id", domainId).eq("campaign_id", c.id);
    if (error) throw new Error(error.message);
    await db.from("evidence").insert({
      workspace_id: c.workspace_id, campaign_id: c.id, domain_id: domainId, kind: "price_check", created_by: s.userId,
      label: "Price checked manually", value: `${p.data.price} ${c.currency} first year, ${p.data.renewal_price} ${c.currency} renewal`,
      detail: { ...p.data, currency: c.currency }, source_name: source, source_url: p.data.source_url,
    });
    await rescoreDomains(db, c, s.userId);
    revalidatePath(`/campaigns/${campaignId}/domains/${domainId}`);
    done(campaignId);
    return { ok: "Price recorded." };
  } catch (e) { return fail(e); }
}
