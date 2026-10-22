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
  | { type: "cta"; heading: string; text: string };

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
    pg.sections.push({ type: "cta", heading: `${f.primaryCta}: ${s.title}`, text: `Tell ${f.name} what you need and the team will confirm the next step.` }, { type: "qualify" });
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
      case "blog": case "article": case "resources": case "case_study": case "testimonials": {
        const pg = page("resources", { title: "Resources", nav: "Resources", heading: "Resources", intro: null, isNew: false });
        pg.sources.push(p.url);
        const links = pg.sections.find((s) => s.type === "links") as Extract<Section, { type: "links" }> | undefined;
        const item = { title: tidyTitle(p, f.name), summary: p.kind === "testimonials" || p.kind === "case_study" ? "Published on their current website." : summary(p), url: p.url };
        if (links) links.items.push(item); else pg.sections.push({ type: "links", items: [item] });
        const proof = p.kind === "testimonials" || p.kind === "case_study";
        map(p, "merged", "resources", proof ? "Linked, not copied: testimonials and results need the business to confirm them first." : "Listed in Resources with a summary and a link to the full article.");
        break;
      }
      case "careers": map(p, "excluded", null, "Hiring content isn't part of the customer journey; it stays on their current site."); break;
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
  for (const p of ok) for (const c of p.claims) if (review.length < 40) review.push(`Trust claim on ${p.url} left out until confirmed: “${c.slice(0, 120)}”`);

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
  if (!has("faq")) ensure("faq", { title: "FAQ", nav: "FAQ", heading: "Questions", intro: null, isNew: true }, []);

  // Home: their content, then the services and the main conversion path.
  if (homeRec) home.sections.push(...text(homeRec));
  home.sections.push({ type: "services" });
  if (has("services")) home.sections.push({ type: "finder" });
  home.sections.push({ type: "cta", heading: f.primaryCta, text: `${f.name} replies to confirm the details.` });

  const order = ["home", "services", "about", "pricing", "book", "quote", "faq", "resources", "contact"];
  const sorted = [...pages.values()].sort((a, b) => (order.indexOf(a.slug) + 1 || 50) - (order.indexOf(b.slug) + 1 || 50));
  const missing = inv ? [] : ["The website hasn't been read page by page yet (run generation with research)."];
  return { built_at: now.toISOString(), pages: sorted.filter((p) => p.sections.length || p.slug === "faq" || p.slug === "home"), originals, features, services, review: [...new Set(review)], missing };
}
