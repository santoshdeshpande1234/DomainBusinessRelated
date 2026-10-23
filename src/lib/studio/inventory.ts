// Original-website inventory: which pages a business's site has and what each one says. Pure
// functions over fetched HTML. Website content is untrusted: it is pattern-matched into plain text,
// never executed, never sent to an AI, and always rendered escaped.

export type PageKind =
  | "home" | "about" | "services" | "service" | "products" | "product" | "solutions" | "pricing" | "faq" | "contact" | "booking"
  | "blog" | "article" | "resources" | "case_study" | "testimonials" | "team" | "careers" | "legal" | "account" | "other";

export type PageRecord = {
  url: string; kind: PageKind; status: "extracted" | "empty" | "failed" | "skipped"; note: string | null;
  title: string | null; description: string | null; h1: string | null; headings: string[];
  paragraphs: string[]; items: string[]; prices: string[]; faqs: { q: string; a: string }[];
  /** Testimonials, awards, certifications and similar, as the business published them. Never shown unchecked. */
  claims: string[];
  /** Customer quotes as published (blockquotes, or quoted text on a testimonials page). Older inventories don't have them. */
  quotes?: string[];
  forms: number; booking: boolean; phones: string[]; emails: string[];
};
export type Social = { network: "facebook" | "instagram" | "linkedin" | "x" | "youtube" | "tiktok" | "pinterest"; url: string };
export type Brand = {
  logo: string | null; accent: string | null; ink: string | null; colorsFrom: string | null;
  // Added with the premium studio; older inventories don't have them.
  /** Their official social profiles, linked from their own site. */
  social?: Social[];
  /** The share image they chose for their site (og:image), used as hero imagery when present. */
  image?: string | null;
};
export type Inventory = {
  root: string; crawled_at: string; brand: Brand; sitemap: boolean; robots: boolean;
  pages: PageRecord[]; queue: string[]; discovered: number;
  /** Crawler version that built it; older inventories are rebuilt. Missing on the first version. */
  version?: number;
};

export const MAX_PAGES = 12;

const decode = (s: string) => s.replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;|&#8217;/g, "'")
  .replace(/&lsquo;|&#8216;/g, "'").replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/g, '"').replace(/&ndash;|&#8211;/g, "–").replace(/&mdash;|&#8212;/g, "—")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c > 31 && c < 65536 ? String.fromCharCode(c) : " "; });
const text = (s: string) => decode(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const SKIP_PATH = /\/(wp-admin|wp-login|wp-json|feed|xmlrpc|cart|checkout|my-account|account|login|signin|sign-in|register|logout|search|tag|tags|author|category|page\/\d+|cdn-cgi)(\/|$)|\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|pptx?|mp4|mp3|xml|txt|css|js|ico)$/i;
const BOILER = /\b(cookies?|we use cookies|accept all|privacy policy|terms (of|and) (use|service|conditions)|all rights reserved|powered by|skip to (main )?content|javascript is (disabled|required)|subscribe to our newsletter|copyright ©|©\s*\d{4})\b/i;
const CLAIM = /\b(award(s|ed|-winning)?|certified|certification|accredited|accreditation|iso \d{3,5}|testimonial|rated \d|\d(\.\d)? ?(\/ ?5|stars?)|five[- ]star|5[- ]star|#1|number one|best in|trusted by|guarantee[ds]?|years of experience|\d{2,}\+? (happy |satisfied )?(clients|customers|patients|students|projects))\b/i;

/** Normalised same-site URL (no hash, no tracking query, no trailing slash), or null if not crawlable. */
export function sameSite(href: string, base: string): string | null {
  try {
    const b = new URL(base);
    const u = new URL(decode(href.trim()), b);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    if (u.hostname.replace(/^www\./, "") !== b.hostname.replace(/^www\./, "")) return null;
    if (SKIP_PATH.test(u.pathname) || u.search.length > 40) return null;
    u.hash = ""; u.search = ""; u.protocol = b.protocol; u.hostname = b.hostname;
    const s = u.toString();
    return s.endsWith("/") && u.pathname !== "/" ? s.slice(0, -1) : s;
  } catch { return null; }
}

/** Internal links, navigation first, with their labels. */
export function discoverLinks(html: string, base: string): { url: string; label: string; nav: boolean }[] {
  const out = new Map<string, { url: string; label: string; nav: boolean }>();
  const navHtml = (html.match(/<(nav|header)[\s\S]*?<\/\1>/gi) ?? []).join(" ");
  const add = (h: string, nav: boolean) => {
    for (const m of h.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const url = sameSite(m[1], base);
      if (!url || out.has(url)) continue;
      out.set(url, { url, label: text(m[2]).slice(0, 80), nav });
    }
  };
  add(navHtml, true);
  add(html, false);
  return [...out.values()];
}

export function parseSitemap(xml: string, base: string): { urls: string[]; nested: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1]));
  const isIndex = /<sitemapindex/i.test(xml);
  return isIndex
    ? { urls: [], nested: locs.filter((l) => { try { return new URL(l).hostname.replace(/^www\./, "") === new URL(base).hostname.replace(/^www\./, ""); } catch { return false; } }).slice(0, 3) }
    : { urls: locs.map((l) => sameSite(l, base)).filter((x): x is string => !!x), nested: [] };
}

export type RobotsRule = { allow: boolean; path: string };

/**
 * Allow and Disallow rules that apply to every crawler ("*") or to us, read group by group (consecutive
 * User-agent lines share the rules that follow them).
 */
export function robotsRules(txt: string): RobotsRule[] {
  const out: RobotsRule[] = [];
  let applies = false, agents = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const [k, ...rest] = line.split(":");
    const v = rest.join(":").trim();
    if (/^user-agent$/i.test(k)) {
      if (!agents) applies = false;
      applies ||= v === "*" || /domain2revenue/i.test(v);
      agents = true;
    } else if (/^(allow|disallow)$/i.test(k)) {
      agents = false;
      if (applies && v) out.push({ allow: /^allow$/i.test(k), path: v });
    } else if (line) agents = false;
  }
  return out;
}

/** A robots.txt path pattern as a regex: "*" matches anything, a trailing "$" anchors the end. */
const pattern = (p: string) => new RegExp(`^${p.replace(/\$$/, "").replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}${p.endsWith("$") ? "$" : ""}`);

/** Whether robots rules let us read a URL: the longest matching rule wins, and Allow wins a tie (as Google reads them). */
export const allowed = (url: string, rules: RobotsRule[]) => {
  const u = new URL(url);
  const target = u.pathname + u.search;
  let best: RobotsRule | null = null;
  for (const r of rules) {
    if (!pattern(r.path).test(target)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return !best || best.allow;
};

const KINDS: [PageKind, RegExp][] = [
  ["legal", /privacy|terms|cookie|disclaimer|legal|refund-policy|gdpr|sitemap/],
  ["account", /login|account|portal|dashboard/],
  ["careers", /career|jobs|vacanc|join-us|hiring/],
  ["contact", /contact|reach-us|get-in-touch|enquir|inquir|locations?|find-us|directions/],
  ["booking", /book|appointment|schedule|reserv/],
  ["faq", /faq|questions/],
  ["pricing", /pric|packages|plans|rates|fees|tariff/],
  ["case_study", /case-stud|portfolio|projects?|our-work|gallery/],
  ["testimonials", /testimonial|reviews|what-clients-say/],
  ["team", /team|doctors|staff|people|leadership|founder/],
  ["about", /about|who-we-are|our-story|company|profile|mission|why-us/],
  ["solutions", /solution|industr|sectors?/],
  ["products", /^\/?(products?|shop|store|catalog(ue)?|collections?)$/],
  ["product", /products?\/|shop\/|collections?\//],
  ["services", /^\/?(services?|what-we-do|treatments?|specialit(y|ies)|our-services|offerings?)$/],
  ["service", /services?\/|treatments?\/|specialit(y|ies)\//],
  ["article", /blog\/|news\/|articles?\/|insights?\/|\d{4}\/\d{2}\//],
  ["blog", /^\/?(blog|news|articles|insights|resources|media|press)$/],
];

export function classify(url: string, title: string | null, isHome = false): PageKind {
  if (isHome) return "home";
  const path = new URL(url).pathname.toLowerCase().replace(/\/$/, "");
  if (!path || path === "/" || /^\/(index|home)(\.\w+)?$/.test(path)) return "home";
  for (const [k, re] of KINDS) if (re.test(path.replace(/^\//, "")) || re.test(path)) return k;
  const t = (title ?? "").toLowerCase();
  if (/\babout\b/.test(t)) return "about";
  if (/\bcontact\b/.test(t)) return "contact";
  if (/\bfaq|frequently asked/.test(t)) return "faq";
  // A single-segment page reached from the main navigation is usually a service or product.
  return path.split("/").filter(Boolean).length === 1 ? "service" : "other";
}

const sentences = (s: string) => s.split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/);

/** The readable content of one page, without navigation, footer, scripts, forms or cookie notices. */
export function extractPage(html: string, url: string, kind: PageKind): PageRecord {
  const meta = (name: string) => html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, "i"))?.[1] ?? null;
  const body = (html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html)
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|iframe|template|aside)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+(class|id)=["'][^"']*(cookie|consent|gdpr|newsletter|popup|modal|breadcrumb)[^"']*["'][^>]*>[\s\S]*?<\/(div|section)>/gi, " ");
  const all = (re: RegExp) => [...body.matchAll(re)].map((m) => text(m[1])).filter(Boolean);
  const claims = new Set<string>();
  // Trust claims are set aside sentence by sentence, so the rest of a paragraph survives.
  const clean = (t: string): string | null => {
    if (BOILER.test(t)) return null;
    if (!CLAIM.test(t)) return t;
    const rest = sentences(t).filter((x) => { if (CLAIM.test(x)) { claims.add(x.slice(0, 300)); return false; } return true; }).join(" ");
    return rest.length >= 3 ? rest : null;
  };
  const keep = (t: string) => clean(t) === t;
  const paragraphs = [...new Set(all(/<p\b[^>]*>([\s\S]*?)<\/p>/gi).map(clean).filter((t): t is string => !!t))].filter((t) => t.length >= 40 && t.length <= 900).slice(0, 12);
  const items = [...new Set(all(/<li\b[^>]*>([\s\S]*?)<\/li>/gi))].filter((t) => t.length >= 3 && t.length <= 160).filter(keep).slice(0, 24);
  const headings = [...new Set(all(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi))].filter((t) => t.length >= 3 && t.length <= 100).filter(keep).slice(0, 16);
  const quotes = new Set<string>();
  for (const q of all(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi)) if (q.length >= 20) { claims.add(q.slice(0, 300)); quotes.add(q.slice(0, 400)); }
  if (kind === "testimonials") for (const q of all(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) if (/^["“].{20,}["”]/.test(q)) quotes.add(q.slice(0, 400));
  const faqs: { q: string; a: string }[] = [];
  for (const m of body.matchAll(/<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi)) {
    const q = text(m[1]), a = text(m[2]);
    if (q.length >= 5 && a.length >= 5 && keep(a)) faqs.push({ q: q.slice(0, 200), a: a.slice(0, 600) });
  }
  for (const m of body.matchAll(/<h[2-4]\b[^>]*>([^<]{5,200}\?)\s*<\/h[2-4]>\s*<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const q = text(m[1]), a = text(m[2]);
    if (a.length >= 5 && keep(a) && !faqs.some((f) => f.q === q)) faqs.push({ q, a: a.slice(0, 600) });
  }
  const plain = text(body);
  const prices = [...new Set(sentences(plain).filter((s) => /[$£€₹]\s?\d|\b(?:rs\.?|inr|usd|aed|sgd)\s?\d/i.test(s) && s.length <= 200))].slice(0, 10);
  const title = text(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 200) || null;
  const h1 = text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "").slice(0, 200) || null;
  const has = paragraphs.length + items.length + faqs.length > 0;
  return {
    url, kind, status: has ? "extracted" : "empty", note: has ? null : "No readable text found (the page may be built with JavaScript or images).",
    title, description: decode(meta("description") ?? "").slice(0, 300) || null, h1, headings, paragraphs, items, prices, faqs: faqs.slice(0, 15), claims: [...claims].slice(0, 10), quotes: [...quotes].slice(0, 8),
    forms: (html.match(/<form[\s>]/gi) ?? []).length,
    booking: /calendly|acuityscheduling|setmore|simplybook|zocdoc|practo|book (an? )?(appointment|now|online)/i.test(html),
    phones: [...new Set([...html.matchAll(/href=["']tel:([^"']+)["']/gi)].map((m) => decode(m[1]).trim()))].slice(0, 3),
    emails: [...new Set([...html.matchAll(/mailto:([^"'?\s>]+)/gi)].map((m) => decode(m[1]).toLowerCase()))].filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0, 3),
  };
}

const HEX = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const expand = (h: string) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h).toLowerCase();
function rgb(h: string) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const saturation = (h: string) => { const [r, g, b] = rgb(h); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const lum = (h: string) => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

/** Logo and brand colours from the home page's own markup (theme-color, inline styles). */
export function extractBrand(html: string, base: string): Brand {
  const abs = (u: string | undefined | null) => { if (!u) return null; try { const x = new URL(decode(u), base); return /^https?:$/.test(x.protocol) ? x.toString() : null; } catch { return null; } };
  const img = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]).find((t) => /logo/i.test(t));
  const logo = abs(img?.match(/\bsrc=["']([^"']+)["']/i)?.[1])
    ?? abs(html.match(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1]);
  const theme = html.match(/<meta[^>]+name=["']theme-color["'][^>]*content=["'](#[0-9a-f]{3,6})["']/i)?.[1];
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>|style=["']([^"']*)["']/gi)].map((m) => m[1] ?? m[2]).join(" ");
  const counts = new Map<string, number>();
  for (const m of styles.matchAll(HEX)) { const h = expand(m[0]); if (saturation(h) > 0.35 && lum(h) > 0.12 && lum(h) < 0.75) counts.set(h, (counts.get(h) ?? 0) + 1); }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const accent = theme && saturation(expand(theme)) > 0.25 && lum(expand(theme)) < 0.8 ? expand(theme) : top;
  const darks = [...styles.matchAll(HEX)].map((m) => expand(m[0])).filter((h) => lum(h) < 0.25 && lum(h) > 0.02);
  const image = abs(html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1]);
  return { logo, accent, ink: darks[0] ?? null, colorsFrom: accent ? (theme && accent === expand(theme) ? "theme-color tag" : "the site's own styles") : null, social: extractSocial(html), image };
}

const SOCIAL: [Social["network"], RegExp][] = [
  ["facebook", /^https?:\/\/(www\.|m\.)?facebook\.com\/(?!sharer|share|dialog|plugins|tr\b)[^\s"'?#]+/i],
  ["instagram", /^https?:\/\/(www\.)?instagram\.com\/(?!p\/|share)[^\s"'?#]+/i],
  ["linkedin", /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/(company|in|school)\/[^\s"'?#]+/i],
  ["x", /^https?:\/\/(www\.)?(twitter|x)\.com\/(?!intent|share|home)[^\s"'?#]+/i],
  ["youtube", /^https?:\/\/(www\.)?youtube\.com\/(@|c\/|channel\/|user\/)[^\s"'?#]+/i],
  ["tiktok", /^https?:\/\/(www\.)?tiktok\.com\/@[^\s"'?#]+/i],
  ["pinterest", /^https?:\/\/([a-z]{2}\.)?pinterest\.[a-z.]+\/(?!pin\/)[^\s"'?#]+/i],
];

/** Official social profiles linked from a page: one per network, share buttons excluded. */
export function extractSocial(html: string): Social[] {
  const out = new Map<Social["network"], string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
    const href = decode(m[1]).trim();
    for (const [network, re] of SOCIAL) {
      const hit = href.match(re);
      if (hit && !out.has(network)) out.set(network, hit[0].replace(/\/$/, ""));
    }
  }
  return [...out.entries()].map(([network, url]) => ({ network, url }));
}

/** Which discovered pages to read, within the page budget: navigation first, then the sitemap. */
export function pickPages(home: string, links: { url: string; nav: boolean }[], sitemap: string[], rules: RobotsRule[], max = MAX_PAGES): string[] {
  const seen = new Set([home]);
  const out: string[] = [];
  const kindOk = (u: string) => !["legal", "account"].includes(classify(u, null));
  const push = (u: string) => { if (!seen.has(u) && out.length < max - 1 && allowed(u, rules) && kindOk(u)) { seen.add(u); out.push(u); } };
  // A listed address deep inside a site (a location or landing page): their real home page is read first.
  const root = new URL(home).origin + "/";
  if (home !== root) push(root);
  links.filter((l) => l.nav).forEach((l) => push(l.url));
  // Then sitemap pages, shallow paths first (service and about pages before blog posts).
  [...sitemap].sort((a, b) => new URL(a).pathname.split("/").length - new URL(b).pathname.split("/").length).forEach(push);
  links.filter((l) => !l.nav).forEach((l) => push(l.url));
  return out;
}

/**
 * Whether the read covered enough of their site to rebuild it. Information the site simply doesn't publish
 * (prices, FAQs) is not a problem with the read; failing to follow its links, or losing many pages, is.
 */
export function readProblem(inv: Inventory): string | null {
  const read = inv.pages.filter((p) => p.status === "extracted").length;
  const lost = inv.pages.length - read;
  if (inv.queue.length) return null;
  if (read <= 1 && inv.discovered > 1) return `Only ${read ? "the first page" : "no page"} could be read of ${inv.discovered} discovered; check the website address or whether the site blocks automated reading.`;
  if (lost * 3 > inv.pages.length) return `${lost} of ${inv.pages.length} pages could not be loaded.`;
  return null;
}

/** Facts across all pages, for the "what we couldn't find" list. */
export function missingInfo(inv: Inventory): string[] {
  const ok = inv.pages.filter((p) => p.status === "extracted");
  const has = (k: PageKind[]) => ok.some((p) => k.includes(p.kind));
  return [
    !has(["about", "team"]) && "About page or company story",
    !has(["service", "services", "product", "products", "solutions"]) && "Service or product pages",
    !ok.some((p) => p.prices.length) && "Published prices or packages",
    !ok.some((p) => p.faqs.length) && "FAQs",
    !ok.some((p) => p.phones.length || p.emails.length) && "Contact details on the website",
    !inv.brand.logo && "Logo",
    !inv.brand.accent && "Brand colours",
    inv.pages.some((p) => p.status === "failed") && `${inv.pages.filter((p) => p.status === "failed").length} page(s) could not be loaded`,
  ].filter((x): x is string => !!x);
}
