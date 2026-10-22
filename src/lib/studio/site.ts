// Website preview content built from verified facts only. Anything we don't know is a visible
// placeholder ("[[...]]") for a member to fill in; a preview can't be marked ready while one remains.
import type { Audit } from "@/lib/discovery/prospects";

export type Service = { title: string; text: string; source: "website" | "member" | "placeholder" };
export type SiteContent = {
  brand: { name: string; eyebrow: string };
  meta: { title: string; description: string };
  hero: { headline: string; sub: string; primary_cta: string; secondary_cta: string };
  services: Service[];
  features: string[];
  steps: string[];
  about: string;
  contact: { phone: string | null; email: string | null; address: string | null; maps_url: string | null };
  booking: boolean;
  sources: { label: string; url: string | null }[];
};

export const THEMES = {
  harbor: { label: "Harbor", ink: "#0f2a44", accent: "#0b6e78", soft: "#e6f3f4", font: "ui-sans-serif, system-ui, sans-serif" },
  sage: { label: "Sage", ink: "#1d3a2a", accent: "#2f6b48", soft: "#eaf3ec", font: "ui-sans-serif, system-ui, sans-serif" },
  clay: { label: "Clay", ink: "#3a2318", accent: "#a2471f", soft: "#f8ece5", font: "Georgia, 'Times New Roman', serif" },
  slate: { label: "Slate", ink: "#1e1b4b", accent: "#4338ca", soft: "#eef0ff", font: "ui-sans-serif, system-ui, sans-serif" },
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
const THEME_FOR: Record<string, ThemeKey[]> = {
  healthcare: ["harbor", "sage"], professional_services: ["slate", "harbor"], real_estate: ["clay", "harbor"], hospitality: ["clay", "sage"],
  education: ["slate", "sage"], automotive: ["harbor", "slate"], home_services: ["sage", "harbor"], manufacturing: ["slate", "harbor"],
  it: ["slate", "harbor"], retail: ["clay", "slate"],
};

export const PLACEHOLDER = /\[\[[^\]]*\]\]/;

export type SiteFacts = {
  id: string; name: string; category: string | null; city: string | null; industry: string; industryLabel: string;
  phone: string | null; email: string | null; address: string | null; maps_url: string | null; website: string | null; audit: Audit | null;
};

/** A deterministic look per business, so two prospects in one campaign don't get identical sites. */
export function pickDesign(f: Pick<SiteFacts, "id" | "industry">): { theme: ThemeKey; layout: keyof typeof LAYOUTS } {
  let h = 2166136261; // FNV-1a: stable across runs and safe to import in the browser
  for (const ch of f.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const options = THEME_FOR[f.industry] ?? (Object.keys(THEMES) as ThemeKey[]);
  return { theme: options[h % options.length], layout: (h >>> 8) % 2 ? "centered" : "split" };
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
    brand: { name: f.name, eyebrow: f.name },
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
