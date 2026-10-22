import "server-only";
import { userClient } from "@/lib/supabase/server";
import { fetchPublicPage } from "@/lib/discovery/net";
import { classify, discoverLinks, sameSite, extractBrand, extractPage, parseSitemap, pickPages, robotsDisallow, type Inventory, type PageRecord } from "./inventory";

type Db = Awaited<ReturnType<typeof userClient>>;

/** Pages fetched per step, so each server call stays well inside serverless time limits. */
const PER_STEP = 4;
/** Inventories older than this are rebuilt. */
export const INVENTORY_MAX_AGE_DAYS = 30;

const get = async (url: string, timeoutMs = 5000) => {
  try { return await fetchPublicPage(url, { timeoutMs, maxBytes: 1_200_000 }); } catch { return null; }
};
const failed = (url: string, note: string): PageRecord => ({
  url, kind: classify(url, null), status: "failed", note, title: null, description: null, h1: null, headings: [], paragraphs: [], items: [], prices: [], faqs: [], claims: [],
  forms: 0, booking: false, phones: [], emails: [],
});

async function read(url: string): Promise<PageRecord> {
  const page = await get(url);
  if (!page) return failed(url, "Could not be loaded (timeout, error or blocked).");
  if (page.status >= 400) return failed(url, `HTTP ${page.status}`);
  if (!/<html|<body|<p\b/i.test(page.html)) return failed(url, "Not an HTML page");
  return extractPage(page.html, page.finalUrl, classify(page.finalUrl, null));
}

/**
 * One step of reading a business's website: the first step reads the home page, robots.txt and the
 * sitemap and queues the pages worth reading; later steps read a few queued pages each.
 */
export async function crawlStep(db: Db, ctx: { workspace_id: string; campaign_id: string; prospect_id: string; website: string; userId: string }, refresh = false) {
  const { data: row } = await db.from("site_inventories").select("id, inventory, crawled_at").eq("prospect_id", ctx.prospect_id).maybeSingle();
  let inv = row?.inventory as Inventory | undefined;
  const age = row?.crawled_at ? (Date.now() - new Date(row.crawled_at).getTime()) / 86_400_000 : Infinity;

  if (!inv || refresh || (age > INVENTORY_MAX_AGE_DAYS && !inv.queue.length)) {
    const home = await get(ctx.website, 6000);
    if (!home || home.status >= 400) throw new Error(home ? `Their home page returned HTTP ${home.status}.` : "Their home page could not be loaded.");
    const root = new URL(home.finalUrl).origin;
    const robots = await get(`${root}/robots.txt`, 3000);
    const robotsTxt = robots && robots.status < 400 && !/<html/i.test(robots.html) ? robots.html : "";
    const disallow = robotsDisallow(robotsTxt);
    const mapUrl = robotsTxt.match(/^sitemap:\s*(\S+)/im)?.[1] ?? `${root}/sitemap.xml`;
    let sitemap: string[] = [];
    const sm = await get(mapUrl, 4000);
    if (sm && sm.status < 400 && /<(urlset|sitemapindex)/i.test(sm.html)) {
      const parsed = parseSitemap(sm.html, root);
      sitemap = parsed.urls;
      if (parsed.nested[0]) { const nested = await get(parsed.nested[0], 4000); if (nested && nested.status < 400) sitemap = parseSitemap(nested.html, root).urls; }
    }
    const links = discoverLinks(home.html, home.finalUrl);
    const queue = pickPages(sameSite(home.finalUrl, home.finalUrl) ?? home.finalUrl, links, sitemap, disallow);
    inv = {
      root, crawled_at: new Date().toISOString(), brand: extractBrand(home.html, home.finalUrl), sitemap: sitemap.length > 0, robots: !!robotsTxt,
      pages: [extractPage(home.html, home.finalUrl, "home")], queue, discovered: new Set([...links.map((l) => l.url), ...sitemap]).size,
    };
  } else if (inv.queue.length) {
    const batch = inv.queue.slice(0, PER_STEP);
    const pages = await Promise.all(batch.map(read));
    const known = new Set(inv.pages.map((p) => p.url));
    inv = { ...inv, pages: [...inv.pages, ...pages.filter((p) => !known.has(p.url))], queue: inv.queue.slice(PER_STEP) };
  }

  const done = inv.queue.length === 0;
  const payload = { workspace_id: ctx.workspace_id, campaign_id: ctx.campaign_id, prospect_id: ctx.prospect_id, inventory: inv, status: done ? "complete" : "crawling", crawled_at: inv.crawled_at, updated_by: ctx.userId };
  const { error } = row
    ? await db.from("site_inventories").update(payload).eq("id", row.id)
    : await db.from("site_inventories").insert({ ...payload, created_by: ctx.userId });
  if (error) throw new Error(error.message);
  return { inventory: inv, remaining: inv.queue.length, reused: !!row && !refresh && age <= INVENTORY_MAX_AGE_DAYS && !row.inventory.queue?.length };
}
