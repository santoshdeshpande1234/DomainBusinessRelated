// The blueprint: merges the original website inventory with the saved Growth Plan. Every original page
// gets a recorded outcome (preserved, improved, merged, replaced or excluded, with a reason) and every
// plan recommendation gets the page or component that implements it and an honest status.
// Pure and deterministic.
import type { GrowthPlan, Gap } from "./growth";
import { engineName } from "./growth";
import type { Inventory, PageKind, PageRecord } from "./inventory";

export type Section =
  | { type: "text"; heading?: string; paragraphs: string[] }
  | { type: "list"; heading?: string; items: string[] }
  | { type: "faq"; heading?: string; items: { q: string; a: string }[] }
  | { type: "prices"; heading?: string; items: string[]; source: string }
  | { type: "links"; heading?: string; items: { title: string; summary: string; url: string }[] }
  | { type: "services" } | { type: "finder" } | { type: "qualify" } | { type: "booking" } | { type: "contact" } | { type: "workflow" }
  /** Where the call to action leads (a page of this site) and an optional second, lighter action. Older previews lack targets. */
  | { type: "cta"; heading: string; text: string; target?: string; topic?: string; secondary?: { label: string; target: string } | null }
  /** Their articles, recreated as pages of the new site. */
  | { type: "articles"; heading?: string; items: { title: string; summary: string; slug: string }[] }
  /** Quotes and credentials exactly as the business published them, each with the page it came from. */
  | { type: "proof"; heading?: string; kind: "quotes" | "credentials"; attributed: { text: string; source: string }[] };

export type SitePage = {
  slug: string; title: string; nav: string | null; heading: string; intro: string | null;
  sections: Section[]; sources: string[]; isNew: boolean;
};
export type Action = "preserved" | "improved" | "merged" | "replaced" | "excluded";
export type OriginalMap = { url: string; title: string; kind: PageKind; extraction: PageRecord["status"]; action: Action; target: string | null; reason: string };
export type FeatureStatus = "implemented" | "simulated" | "proposed" | "review";
export type FeatureRow = {
  key: string; gap: string; recommendation: string; engine: string; page: string; component: string; ai: string; automation: string;
  dependencies: string[]; benefit: string; kpi: string; priority: Gap["priority"]; status: FeatureStatus; note: string;
};
export type Blueprint = {
  built_at: string; pages: SitePage[]; originals: OriginalMap[]; features: FeatureRow[];
  services: { title: string; text: string; slug: string | null; source: string | null }[];
  review: string[]; missing: string[];
};

type Facts = { name: string; industry: string; primaryCta: string; booking: boolean; hasPhone: boolean };

const SERVICE_KINDS: PageKind[] = ["service", "product", "solutions"];
const CREDENTIAL = /\b(award|certified|certification|accredited|accreditation|iso \d{3,5}|member of|registered|licensed|partner)\b/i;
const UNPROVEN = /award[- ]winning|leading|trusted by|#1|number one|best in|guarantee|\d+\+|\d{2,} (happy |satisfied )?(clients|customers|patients)/i;
const dedupe = <T extends { text: string }>(xs: T[]) => xs.filter((x, i) => xs.findIndex((y) => y.text === x.text) === i);

/** The page a call to action should open: booking when they take bookings, a quote request, else contact. */
export function mainTarget(slugs: string[], booking: boolean): string {
  if (booking && slugs.includes("book")) return "book";
  if (slugs.includes("quote")) return "quote";
  return "contact";
}
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "page";
const tidyTitle = (p: PageRecord, brand: string) => {
  const raw = p.h1 || p.title || new URL(p.url).pathname.split("/").filter(Boolean).pop()?.replace(/[-_]/g, " ") || "Page";
  // "Dental implants | Smile Studio" → "Dental implants"
  const parts = raw.split(/\s+[|–—-]\s+/).filter((x) => x.toLowerCase() !== brand.toLowerCase());
  return (parts[0] ?? raw).replace(/\s+/g, " ").trim().slice(0, 80);
};
const summary = (p: PageRecord) => (p.description ?? p.paragraphs[0] ?? "").slice(0, 220);

/** Drops paragraphs or items that mention another business in this campaign; reports what was dropped. */
function scrub(p: PageRecord, others: string[], review: string[]): PageRecord {
  const bad = others.map((o) => o.trim().toLowerCase()).filter((o) => o.length >= 4);
  if (!bad.length) return p;
  const ok = (t: string) => !bad.some((o) => t.toLowerCase().includes(o));
  const n = p.paragraphs.filter((t) => !ok(t)).length + p.items.filter((t) => !ok(t)).length + p.faqs.filter((f) => !ok(f.q + f.a)).length;
  if (n) review.push(`${n} passage(s) on ${p.url} mention another business in this campaign and were left out.`);
  return { ...p, paragraphs: p.paragraphs.filter(ok), items: p.items.filter(ok), faqs: p.faqs.filter((f) => ok(f.q + f.a)), headings: p.headings.filter(ok) };
}

export function buildBlueprint(inv: Inventory | null, plan: GrowthPlan, f: Facts, others: string[] = [], now = new Date()): Blueprint {
  const review: string[] = [];
  const pagesIn = (inv?.pages ?? []).map((p) => scrub(p, others.filter((o) => o.trim().toLowerCase() !== f.name.trim().toLowerCase()), review));
  const ok = pagesIn.filter((p) => p.status === "extracted");
  const originals: OriginalMap[] = [];
  const pages = new Map<string, SitePage>();
  const page = (slug: string, init: Omit<SitePage, "slug" | "sections" | "sources">) => {
    if (!pages.has(slug)) pages.set(slug, { slug, sections: [], sources: [], ...init });
    return pages.get(slug)!;
  };
  const text = (p: PageRecord, heading?: string): Section[] => [
    ...(p.paragraphs.length ? [{ type: "text" as const, heading, paragraphs: p.paragraphs }] : []),
    ...(p.items.length >= 3 ? [{ type: "list" as const, heading: p.headings[0] && p.headings[0] !== heading ? p.headings[0] : undefined, items: p.items.slice(0, 16) }] : []),
  ];
  const map = (p: PageRecord, action: Action, target: string | null, reason: string) => originals.push({ url: p.url, title: tidyTitle(p, f.name), kind: p.kind, extraction: p.status, action, target, reason });

  // Home first so it leads the navigation.
  const homeRec = ok.find((p) => p.kind === "home");
  const home = page("home", { title: "Home", nav: "Home", heading: f.name, intro: homeRec?.description ?? null, isNew: !homeRec });
  if (homeRec) home.sources.push(homeRec.url);

  // Services and products: one detail page each, from the business's own page.
  const serviceRecs = ok.filter((p) => SERVICE_KINDS.includes(p.kind)).slice(0, 10);
  const services = serviceRecs.map((p) => ({ title: tidyTitle(p, f.name), text: summary(p), slug: `service-${slugify(tidyTitle(p, f.name))}`, source: p.url }));
  for (const [i, p] of serviceRecs.entries()) {
    const s = services[i];
    const pg = page(s.slug, { title: s.title, nav: null, heading: s.title, intro: p.description, isNew: false });
    pg.sources.push(p.url);
    pg.sections.push(...text(p));
    if (p.prices.length) pg.sections.push({ type: "prices", heading: "Prices published on their site", items: p.prices, source: p.url });
    if (p.faqs.length) pg.sections.push({ type: "faq", heading: `Questions about ${s.title}`, items: p.faqs });
    pg.sections.push({ type: "cta", heading: `Discuss ${s.title.toLowerCase()} with ${f.name}`, text: "Tell the team about your situation and they will confirm the right next step.", topic: s.title,
      secondary: { label: "See all services", target: "services" } });
    map(p, "improved", s.slug, "Kept its content; added a clear call to action, a qualifying enquiry form and search-ready structure.");
  }
  if (services.length || ok.some((p) => p.kind === "services" || p.kind === "products")) {
    const idx = page("services", { title: "Services", nav: "Services", heading: "Services", intro: null, isNew: false });
    idx.sections.push({ type: "services" }, { type: "finder" });
  }

  for (const p of pagesIn) {
    if (p.kind === "home" && p.status === "extracted") { map(p, "improved", "home", "Kept their positioning and key content; rebuilt around the main call to action and Growth Engine features."); continue; }
    if (SERVICE_KINDS.includes(p.kind) && serviceRecs.includes(p)) continue;
    if (p.status === "failed") { map(p, "excluded", null, `Could not be read (${p.note ?? "error"}); check it by hand.`); review.push(`Original page not read: ${p.url}`); continue; }
    if (p.status === "empty") { map(p, "excluded", null, "No readable text (likely built with scripts or images); check it by hand."); review.push(`No readable text on ${p.url}`); continue; }
    switch (p.kind) {
      case "about": case "team": {
        const pg = page("about", { title: "About", nav: "About", heading: `About ${f.name}`, intro: null, isNew: false });
        pg.sources.push(p.url); pg.sections.push(...text(p, p.kind === "team" ? tidyTitle(p, f.name) : undefined));
        map(p, p.kind === "about" && pg.sources.length === 1 ? "improved" : "merged", "about", p.kind === "team" ? "Team content merged into About." : "Kept their story in their own words.");
        break;
      }
      case "services": case "products": {
        const pg = page("services", { title: "Services", nav: "Services", heading: tidyTitle(p, f.name), intro: p.description, isNew: false });
        pg.sources.push(p.url); if (p.paragraphs.length) pg.sections.unshift({ type: "text", paragraphs: p.paragraphs.slice(0, 4) });
        map(p, "improved", "services", "Overview kept; each service links to its own page and a service finder was added.");
        break;
      }
      case "pricing": {
        const pg = page("pricing", { title: "Pricing", nav: "Pricing", heading: tidyTitle(p, f.name), intro: p.description, isNew: false });
        pg.sources.push(p.url); pg.sections.push(...text(p));
        if (p.prices.length) pg.sections.push({ type: "prices", items: p.prices, source: p.url });
        pg.sections.push({ type: "qualify" });
        map(p, "preserved", "pricing", "Published prices kept exactly as written, with a quote request added.");
        review.push(`Prices on ${p.url} are copied as published; confirm they are current before sharing.`);
        break;
      }
      case "faq": {
        const pg = page("faq", { title: "FAQ", nav: "FAQ", heading: "Questions", intro: null, isNew: false });
        pg.sources.push(p.url); if (p.faqs.length) pg.sections.unshift({ type: "faq", items: p.faqs }); else pg.sections.push(...text(p));
        map(p, "improved", "faq", "Their questions kept; the AI concierge answers from the same content.");
        break;
      }
      case "contact": {
        const pg = page("contact", { title: "Contact", nav: "Contact", heading: tidyTitle(p, f.name), intro: p.description, isNew: false });
        pg.sources.push(p.url); pg.sections.unshift(...text(p));
        map(p, "improved", "contact", "Contact details kept; the enquiry form now qualifies and routes enquiries.");
        break;
      }
      case "booking":
        page("book", { title: f.booking ? "Book" : "Request", nav: f.booking ? "Book" : null, heading: f.primaryCta, intro: null, isNew: false }).sources.push(p.url);
        map(p, "replaced", "book", "Replaced by the new booking request flow; same purpose.");
        break;
      case "resources": case "blog": {
        // A hub page: its own text introduces the Resources page; its articles arrive as their own records.
        const pg = page("resources", { title: "Resources", nav: "Resources", heading: tidyTitle(p, f.name), intro: p.description, isNew: false });
        pg.sources.push(p.url); if (p.paragraphs.length) pg.sections.unshift({ type: "text", paragraphs: p.paragraphs.slice(0, 3) });
        map(p, "improved", "resources", "Kept as the Resources hub; every article it lists that was read is recreated as a page here.");
        break;
      }
      case "article": case "case_study": {
        const story = p.kind === "case_study";
        const t = tidyTitle(p, f.name);
        const slug = `${story ? "story" : "article"}-${slugify(t)}`;
        const hub = story
          ? page("stories", { title: "Success stories", nav: "Success stories", heading: "Success stories", intro: `Work ${f.name} has published, as they described it.`, isNew: false })
          : page("resources", { title: "Resources", nav: "Resources", heading: "Resources", intro: null, isNew: false });
        const pg = page(slug, { title: t, nav: null, heading: t, intro: p.description, isNew: false });
        pg.sources.push(p.url); pg.sections.push(...text(p));
        pg.sections.push({ type: "cta", heading: story ? `Explore a similar solution with ${f.name}` : `Questions about ${t.toLowerCase()}?`, text: `Tell ${f.name} about your situation and the team will suggest the right next step.` });
        const list = hub.sections.find((x) => x.type === "articles") as Extract<Section, { type: "articles" }> | undefined;
        const item = { title: t, summary: summary(p), slug };
        if (list) list.items.push(item); else hub.sections.push({ type: "articles", items: [item] });
        hub.sources.push(p.url);
        map(p, "improved", slug, story ? "Recreated as a success story in their own words; outcomes are only what they published." : "Recreated as an article page with its source credited, so visitors stay on the new site.");
        if (story) review.push(`Success story copied from ${p.url}; confirm the client is happy to be named before publishing.`);
        break;
      }
      case "testimonials": {
        const qs = p.quotes ?? [];
        if (!qs.length) { map(p, "excluded", null, "No quotes could be read from this page; add them by hand if wanted."); review.push(`Testimonials page ${p.url} had no readable quotes.`); break; }
        const pg = page("testimonials", { title: "What clients say", nav: "Testimonials", heading: "What clients say", intro: `Quoted from ${f.name}'s own website.`, isNew: false });
        pg.sources.push(p.url);
        map(p, "improved", "testimonials", `${qs.length} quote(s) kept word for word with their source; nothing added.`);
        break;
      }
      case "careers": {
        const pg = page("careers", { title: "Careers", nav: null, heading: tidyTitle(p, f.name), intro: p.description, isNew: false });
        pg.sources.push(p.url); pg.sections.push(...text(p));
        pg.sections.push({ type: "cta", heading: "Interested in working here?", text: `Send ${f.name} a note about the role you're interested in.`, target: "contact" });
        map(p, "preserved", "careers", "Kept as a careers page in the footer; applications go through the contact form.");
        break;
      }
      case "legal": map(p, "excluded", null, "Legal pages must come from the business itself."); break;
      case "account": map(p, "excluded", null, "Customer logins stay on their existing system."); break;
      default: {
        const t = tidyTitle(p, f.name);
        const slug = `page-${slugify(t)}`;
        const pg = page(slug, { title: t, nav: null, heading: t, intro: p.description, isNew: false });
        pg.sources.push(p.url); pg.sections.push(...text(p));
        map(p, "preserved", slug, "Kept as its own page.");
      }
    }
  }
  // Social proof, exactly as published and credited. Statistics and superlatives stay out until confirmed.
  const quotes = dedupe(ok.flatMap((p) => (p.quotes ?? []).map((q) => ({ text: q, source: p.url })))).slice(0, 9);
  const credentials = dedupe(ok.flatMap((p) => p.claims.filter((c) => CREDENTIAL.test(c) && !UNPROVEN.test(c) && !(p.quotes ?? []).includes(c)).map((c) => ({ text: c, source: p.url })))).slice(0, 6);
  if (quotes.length) {
    const t = pages.get("testimonials");
    if (t) t.sections.push({ type: "proof", kind: "quotes", attributed: quotes });
    review.push(`${quotes.length} customer quote(s) are shown word for word from their site; confirm they may be reused.`);
  }
  if (credentials.length) {
    page("about", { title: "About", nav: "About", heading: `About ${f.name}`, intro: null, isNew: true }).sections.push({ type: "proof", kind: "credentials", heading: "What they publish about their credentials", attributed: credentials });
    review.push(`${credentials.length} credential statement(s) are shown as published; check them before launch.`);
  }
  const shown = new Set([...quotes, ...credentials].map((x) => x.text));
  for (const p of ok) for (const c of p.claims) if (!shown.has(c) && review.length < 40) review.push(`Trust claim on ${p.url} left out until confirmed: “${c.slice(0, 120)}”`);

  // ---------------------------------------------------------------- Growth Plan features
  const features: FeatureRow[] = [];
  const has = (slug: string) => pages.has(slug);
  const ensure = (slug: string, init: Omit<SitePage, "slug" | "sections" | "sources">, sections: Section[]) => {
    const pg = page(slug, init);
    for (const s of sections) if (!pg.sections.some((x) => x.type === s.type)) pg.sections.push(s);
    return pg;
  };
  const contact = () => ensure("contact", { title: "Contact", nav: "Contact", heading: f.primaryCta, intro: null, isNew: true }, [{ type: "qualify" }, { type: "contact" }]);
  const origHas = (pred: (p: PageRecord) => boolean) => ok.find(pred);

  for (const g of plan.gaps) {
    const row = (page: string, component: string, status: FeatureStatus, note: string): FeatureRow => ({
      key: g.key, gap: g.gap, recommendation: g.solution, engine: g.layer === "foundation" ? "Website foundation" : engineName(g.layer, f.industry),
      page, component, ai: g.automation, automation: g.automation, dependencies: g.dependencies, benefit: g.benefit, kpi: g.kpi, priority: g.priority, status, note,
    });
    switch (g.key) {
      case "form": {
        contact();
        const elsewhere = origHas((p) => p.forms > 0 && p.kind !== "home");
        features.push(row("contact + every service page", "Qualifying enquiry form", elsewhere ? "review" : "simulated",
          elsewhere ? `Their site has a form on ${elsewhere.url}; the gap was seen on the home page only. The new form is a demo and sends nothing.` : "The form works in the preview but sends nothing; lead creation needs their CRM."));
        break;
      }
      case "cta": features.push(row("site-wide", "Primary call to action in header and every page", "implemented", "")); break;
      case "booking": {
        ensure("book", { title: "Book", nav: "Book", heading: f.primaryCta, intro: null, isNew: !has("book") }, [{ type: "booking" }, { type: "qualify" }]);
        const elsewhere = origHas((p) => p.booking && p.kind !== "home");
        features.push(row("book", "Booking request flow", elsewhere ? "review" : "simulated",
          elsewhere ? `Booking wording or a booking tool was found on ${elsewhere.url}; confirm what they use today.` : "Booking needs their calendar system to go live."));
        break;
      }
      case "pricing": {
        const priced = ok.find((p) => p.prices.length);
        if (priced) features.push(row(has("pricing") ? "pricing" : "service pages", "Published prices", "review", `Prices were found on ${priced.url}; the gap came from the home page. Confirm prices are current.`));
        else {
          ensure("quote", { title: "Get a quote", nav: f.booking ? null : "Get a quote", heading: "Get a quote", intro: null, isNew: true }, [{ type: "qualify" }]);
          features.push(row("quote", "Guided quote request", "review", "Publishing price ranges needs the business's approval; the guided request works without them."));
        }
        break;
      }
      case "discovery": {
        ensure("services", { title: "Services", nav: "Services", heading: "Services", intro: null, isNew: true }, [{ type: "services" }, { type: "finder" }]);
        features.push(row("services", "Service pages and service finder", services.length ? "review" : "implemented",
          services.length ? `${services.length} service page(s) were found on inner pages, so discovery is better than the home page suggested; kept and linked.` : "Service finder is a working demo."));
        break;
      }
      case "answers": features.push(row("site-wide", "AI concierge", "simulated", "Scripted from their published content; connecting an AI model needs a key and approved knowledge.")); break;
      case "tel": case "mobile": features.push(row("site-wide", g.feature, "implemented", "")); break;
      case "https": case "speed": case "unverified": features.push(row("site-wide", g.feature, "proposed", "Delivered by hosting at deployment.")); break;
      case "search":
        features.push(row(services.length ? "service pages" : "home", "Service landing pages, search descriptions and structured data", "implemented", "Content publishing workflow is a proposed integration."));
        break;
      case "fresh": features.push(row(has("resources") ? "resources" : "—", has("resources") ? "Resources hub with their articles" : "Content publishing workflow", has("resources") ? "implemented" : "proposed", "")); break;
      case "follow_up": contact().sections.push({ type: "workflow" }); features.push(row("contact", "Automated enquiry workflow", "simulated", "Shows the steps; runs nothing until connected to their CRM and messaging.")); break;
      case "retention": case "reviews": features.push(row("—", g.feature, "proposed", g.dependencies.join("; "))); break;
      case "tracking": features.push(row("site-wide", "Conversion events for calls, forms, bookings and chats", "proposed", "Needs an analytics account they own.")); break;
      case "no_site": features.push(row("home", "Complete website", "implemented", "")); break;
      default: features.push(row("—", g.feature, "review", "Not mapped to a page automatically; decide where it belongs."));
    }
  }
  contact();
  // A business that takes bookings gets the booking flow even when booking wasn't a gap (they already offer it).
  if (f.booking) ensure("book", { title: "Book", nav: "Book", heading: f.primaryCta, intro: null, isNew: !has("book") }, [{ type: "booking" }, { type: "qualify" }]);
  if (!has("faq")) ensure("faq", { title: "FAQ", nav: "FAQ", heading: "Questions", intro: null, isNew: true }, []);

  // Home: their content, then the services, proof and the main conversion path.
  if (homeRec) home.sections.push(...text(homeRec));
  home.sections.push({ type: "services" });
  if (has("services")) home.sections.push({ type: "finder" });
  if (quotes.length) home.sections.push({ type: "proof", kind: "quotes", heading: "In their clients' words", attributed: quotes.slice(0, 3) });
  const top = services.slice(0, 3).map((x) => x.title);
  home.sections.push({ type: "cta", heading: `${f.primaryCta} with ${f.name}`,
    text: `Tell the team what you need${top.length ? `, whether it's ${top.join(", ")} or something else,` : ""} and get a clear next step.`,
    secondary: has("services") ? { label: "Explore services", target: "services" } : null });

  // Every call to action without a destination leads to the main conversion page.
  const main = mainTarget([...pages.keys()], f.booking);
  for (const pg of pages.values()) for (const sec of pg.sections) if (sec.type === "cta" && !sec.target) sec.target = main;

  const order = ["home", "services", "about", "stories", "testimonials", "pricing", "book", "quote", "faq", "resources", "contact", "careers"];
  const sorted = [...pages.values()].sort((a, b) => (order.indexOf(a.slug) + 1 || 50) - (order.indexOf(b.slug) + 1 || 50));
  const missing = inv ? [] : ["The website hasn't been read page by page yet (run generation with research)."];
  return { built_at: now.toISOString(), pages: sorted.filter((p) => p.sections.length || p.slug === "faq" || p.slug === "home"), originals, features, services, review: [...new Set(review)], missing };
}
