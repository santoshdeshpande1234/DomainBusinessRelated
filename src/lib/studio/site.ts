// Website preview content built from verified facts only. Anything we don't know is a visible
// placeholder ("[[...]]") for a member to fill in; a preview can't be marked ready while one remains.
import type { Audit } from "@/lib/discovery/prospects";
import type { ClientGrowth, EngineKey } from "./growth";
import type { SitePage } from "./blueprint";
import { defaultDirection, type DirectionKey } from "./design";

export type Service = { title: string; text: string; source: "website" | "member" | "placeholder"; slug?: string | null };
export type SiteContent = {
  brand: {
    name: string; eyebrow: string; logo?: string | null; colors?: { accent: string; ink: string | null } | null;
    /** Official social profiles and their own share image, from their website. */
    social?: { network: string; url: string }[]; image?: string | null;
  };
  /** The campaign industry, for the palette and default design direction. Older previews don't have it. */
  industry?: string;
  /** Public facts that support credibility, each with where it came from. */
  proof?: { rating?: { value: number; count: number | null; source: string } | null };
  meta: { title: string; description: string };
  hero: { headline: string; sub: string; primary_cta: string; secondary_cta: string };
  services: Service[];
  features: string[];
  steps: string[];
  about: string;
  contact: { phone: string | null; email: string | null; address: string | null; maps_url: string | null };
  booking: boolean;
  sources: { label: string; url: string | null }[];
  // Added with the growth plan; older previews don't have these and render as before.
  growth?: ClientGrowth;
  faq?: { q: string; a: string }[];
  assistant?: { greeting: string; answers: { q: string; a: string; keys: string[] }[]; fallback: string };
  finder?: { question: string; options: { need: string; service: string; cta: string }[] };
  sections?: Sections;
  /** Pages of the proposed website, from the blueprint. Older previews are a single page. */
  pages?: SitePage[];
};
export type Sections = { assistant: boolean; finder: boolean; qualify: boolean; faq: boolean; differentiation: boolean };
export const SECTION_LABELS: Record<keyof Sections, string> = {
  assistant: "AI concierge demo", finder: "Service finder", qualify: "Qualifying enquiry form", faq: "FAQ", differentiation: "Why choose us",
};

export const THEMES = {
  harbor: { label: "Harbor", ink: "#0f2a44", accent: "#0b6e78", soft: "#e6f3f4", font: "ui-sans-serif, system-ui, sans-serif" },
  sage: { label: "Sage", ink: "#1d3a2a", accent: "#2f6b48", soft: "#eaf3ec", font: "ui-sans-serif, system-ui, sans-serif" },
  clay: { label: "Clay", ink: "#3a2318", accent: "#a2471f", soft: "#f8ece5", font: "Georgia, 'Times New Roman', serif" },
  slate: { label: "Slate", ink: "#1e1b4b", accent: "#4338ca", soft: "#eef0ff", font: "ui-sans-serif, system-ui, sans-serif" },
  atelier: { label: "Atelier (premium)", ink: "#1c1917", accent: "#8a6a3b", soft: "#f6f1e9", font: "Georgia, 'Times New Roman', serif" },
} as const;
export type ThemeKey = keyof typeof THEMES;
export const LAYOUTS = { split: "Split hero", centered: "Centered hero" } as const;

const CTA: Record<string, [string, string]> = {
  healthcare: ["Book an appointment", "Call the clinic"],
  professional_services: ["Request a consultation", "Call us"],
  real_estate: ["Book a viewing", "Call the office"],
  hospitality: ["Check availability", "Call us"],
  education: ["Book a trial class", "Call us"],
  automotive: ["Book a service", "Call the workshop"],
  home_services: ["Get a quote", "Call now"],
  manufacturing: ["Request a quote", "Talk to sales"],
  it: ["Talk to us", "Call us"],
  retail: ["Plan your visit", "Call the store"],
};

export const PLACEHOLDER = /\[\[[^\]]*\]\]/;

export type SiteFacts = {
  id: string; name: string; category: string | null; city: string | null; industry: string; industryLabel: string;
  phone: string | null; email: string | null; address: string | null; maps_url: string | null; website: string | null; audit: Audit | null;
};

/**
 * The starting design direction for a business: what its industry expects. Colours come from its own
 * brand, so two prospects in one campaign still look different. `theme` stores the direction.
 */
export function pickDesign(f: Pick<SiteFacts, "id" | "industry">): { theme: DirectionKey; layout: keyof typeof LAYOUTS } {
  let h = 2166136261; // FNV-1a: stable across runs and safe to import in the browser
  for (const ch of f.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return { theme: defaultDirection(f.industry), layout: (h >>> 8) % 2 ? "centered" : "split" };
}

export function buildSite(f: SiteFacts): SiteContent {
  const a = f.audit && !f.audit.error ? f.audit : null;
  const [primary, secondary] = CTA[f.industry] ?? ["Get in touch", "Call us"];
  const what = f.category ?? f.industryLabel;
  const where = f.city ? ` in ${f.city}` : "";
  const fromSite = (a?.nav ?? []).slice(0, 6);
  const services: Service[] = fromSite.length >= 2
    ? fromSite.map((t) => ({ title: t, text: "", source: "website" }))
    : [1, 2, 3].map((i) => ({ title: `[[Service ${i}]]`, text: "", source: "placeholder" }));

  const features = [
    "Clear next step on every page",
    f.phone ? "Tap to call from any phone" : null,
    "Short inquiry form that works on phones",
    primary.startsWith("Book") || primary === "Check availability" ? "Request a booking online, any time" : null,
    "Fast, accessible pages with readable text",
  ].filter((x): x is string => !!x);

  return {
    brand: { name: f.name, eyebrow: f.name }, industry: f.industry,
    meta: {
      title: `${f.name}${f.city ? ` | ${what} in ${f.city}` : ` | ${what}`}`.slice(0, 70),
      description: (a?.description ?? `${f.name}: ${what.toLowerCase()}${where}. ${primary} or call to talk to the team.`).slice(0, 160),
    },
    hero: { headline: `${what}${where}`, sub: `${primary} with ${f.name}. Tell us what you need and the team will get back to you.`, primary_cta: primary, secondary_cta: f.phone ? secondary : "Send an inquiry" },
    services,
    features,
    steps: ["Tell us what you need", `${f.name} confirms the details with you`, "Get started at a time that suits you"],
    about: a?.description ?? "[[A few sentences about the business, in its own words]]",
    contact: { phone: f.phone, email: f.email, address: f.address, maps_url: f.maps_url },
    booking: primary.startsWith("Book") || primary === "Check availability",
    sources: [
      ...(a ? [{ label: "Their current website", url: a.final_url }] : []),
      ...(f.maps_url ? [{ label: "Google Maps listing", url: f.maps_url }] : []),
    ],
  };
}

/** Every placeholder still in the content, as "where: text". */
export function gaps(c: SiteContent): string[] {
  const out: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") { const m = v.match(PLACEHOLDER); if (m) out.push(`${path}: ${m[0].slice(2, -2)}`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path} ${i + 1}`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (k !== "sources") walk(x, path ? `${path} › ${k}` : k);
  };
  walk(c, "");
  return out;
}

/** schema.org data for the preview, with only the facts we hold. */
export function jsonLd(c: SiteContent, url: string | null) {
  return {
    "@context": "https://schema.org", "@type": "LocalBusiness", name: c.brand.name, description: PLACEHOLDER.test(c.about) ? undefined : c.about,
    telephone: c.contact.phone ?? undefined, email: c.contact.email ?? undefined, address: c.contact.address ?? undefined, url: url ?? undefined,
  };
}

// ---------------------------------------------------------------- growth layer

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Adds the growth plan, FAQ and interactive demos to a site. Everything here comes from the content's
 * own facts (services, contact details) or the client-safe plan, so it can't mention another business.
 */
export function withGrowth(c: SiteContent, g: ClientGrowth, opts: { keepHero?: boolean; sections?: Partial<Sections> } = {}): SiteContent {
  const services = c.services.filter((s) => !PLACEHOLDER.test(s.title)).map((s) => s.title);
  const tel = c.contact.phone;
  const action = lc(c.hero.primary_cta);
  const faq = [
    { q: `How do I ${action}?`, a: `Use the “${c.hero.primary_cta}” form on this page${tel ? ` or call ${tel}` : ""}. ${c.brand.name} will confirm the details with you.` },
    services.length ? { q: `What does ${c.brand.name} offer?`, a: `${services.join(", ")}. Ask about any of these through the form.` } : null,
    c.contact.address ? { q: "Where are you?", a: c.contact.address } : null,
    tel || c.contact.email ? { q: "How can I contact the team?", a: [tel && `Call ${tel}`, c.contact.email && `email ${c.contact.email}`].filter(Boolean).join(" or ") + "." } : null,
    { q: "What happens after I send an enquiry?", a: `${c.brand.name} reviews it and replies to confirm the next step.` },
  ].filter((x): x is { q: string; a: string } => !!x);

  const answers = [
    services.length ? { q: "What services do you offer?", a: `${c.brand.name} offers ${services.join(", ")}.`, keys: ["service", "offer", "do you do", "treatment", "provide", "help with"] } : null,
    { q: `How do I ${action}?`, a: faq[0].a, keys: ["book", "appointment", "quote", "visit", "start", "enquir", "inquir", "consult", "availability"] },
    tel ? { q: "What's your phone number?", a: `You can call ${tel}.`, keys: ["phone", "call", "number", "talk"] } : null,
    c.contact.address ? { q: "Where are you located?", a: `${c.brand.name} is at ${c.contact.address}.`, keys: ["where", "address", "located", "location", "find you", "directions"] } : null,
    { q: "How much does it cost?", a: "Prices aren't published on this page yet. Send an enquiry and the team will give you a quote for your situation.", keys: ["price", "cost", "fee", "how much", "charge", "rate"] },
    { q: "When are you open?", a: `Opening hours haven't been confirmed for this preview${tel ? `; please call ${tel} to check` : ""}.`, keys: ["open", "hours", "close", "today", "weekend", "time"] },
  ].filter((x): x is { q: string; a: string; keys: string[] } => !!x);

  const finderOptions = services.length >= 2
    ? services.slice(0, 6).map((s) => ({ need: s, service: s, cta: c.hero.primary_cta }))
    : (g.qualify[0]?.options ?? []).map((o) => ({ need: o, service: `${c.brand.name} will recommend the right option`, cta: c.hero.primary_cta }));

  const hero = opts.keepHero ? c.hero : {
    ...c.hero,
    sub: `${g.segment ? `For ${g.segment}: ` : ""}${g.promise}`,
  };
  return {
    ...c, hero, growth: g, faq,
    assistant: { greeting: `Hi! Ask me about ${c.brand.name}.`, answers, fallback: `I can only answer from the details on this page. In the live version, questions I can't answer go straight to the ${c.brand.name} team.` },
    finder: { question: g.qualify[0]?.label ?? "What do you need?", options: finderOptions },
    sections: { assistant: true, finder: finderOptions.length >= 2, qualify: true, faq: true, differentiation: g.differentiation.length + g.strengths.length > 0, ...c.sections, ...opts.sections },
  };
}

/** Moves one engine to the front, marking the first three as primary. */
export function focusEngine(g: ClientGrowth, key: EngineKey | null): ClientGrowth {
  if (!key) return { ...g, focus: null };
  const engines = [...g.engines].sort((a, b) => Number(b.key === key) - Number(a.key === key)).map((e, i) => ({ ...e, primary: i < 3 }));
  return { ...g, engines, focus: key };
}

// Claims a fact-only preview must never make unless the business published them.
const TRUST_CLAIM = /\b(testimonials?|award[- ]winning|awards?|certified|accredited|#1|number one|best in|guaranteed?|rated \d|five[- ]star|5[- ]star|trusted by \d|\d+\+? (happy )?(clients|customers|patients))\b/i;

/** Stage 8: checks a generated site before it is saved. Returns problems; empty means valid. */
export function validateSite(c: SiteContent, otherBusinesses: string[] = []): string[] {
  const out: string[] = [];
  if (!c.brand?.name?.trim()) out.push("Business name is missing");
  if (!c.hero?.headline?.trim()) out.push("Hero headline is missing");
  if (!c.services?.length) out.push("No services section");
  if (!c.contact?.phone && !c.contact?.email && !c.hero?.primary_cta) out.push("No way to get in touch");
  if (c.growth && !c.growth.engines.length) out.push("No Growth Engines selected");
  const text: string[] = [];
  const walk = (v: unknown, k = "") => {
    if (typeof v === "string") { if (k !== "url") text.push(v); }
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    // Quotes and credentials are shown as the business published them, with their source; checked by the quality gate.
    else if (v && typeof v === "object") for (const [kk, x] of Object.entries(v)) if (kk !== "sources" && kk !== "attributed") walk(x, kk);
  };
  walk(c);
  // Our own disclaimers ("rankings are never guaranteed") are not claims.
  const all = text.join("\n").replace(/\b(never|not|no \w+ is) guaranteed\b/gi, "");
  const claim = all.match(TRUST_CLAIM);
  if (claim) out.push(`Unsupported trust claim: “${claim[0]}”`);
  const own = c.brand.name.toLowerCase();
  for (const n of otherBusinesses) {
    const x = n.trim().toLowerCase();
    if (x.length >= 4 && !own.includes(x) && all.toLowerCase().includes(x)) out.push(`Mentions another business: ${n}`);
  }
  return out;
}
