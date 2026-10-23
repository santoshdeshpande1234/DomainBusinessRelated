// Competitive position: where a business is ahead of, level with or behind the nearby businesses it
// was compared with, which capabilities it should build, and what to prepare for over the next five
// years. Pure, deterministic code, no AI calls.
//
// Differentiation is the primary criterion. Website defects are one dimension ("digital foundation")
// among six, and it carries the lowest weight in every industry. Every comparison is a count from
// observed checks or public listings ("3 of 5 nearby businesses"), never a competitor's name, so the
// same sentences are safe in a client-facing plan. Anything we couldn't compare says so.
import type { Audit } from "@/lib/discovery/prospects";
import type { Side } from "./competitors";
import type { EngineKey } from "./growth";

export type DimKey = "reputation" | "convenience" | "responsiveness" | "offer" | "visibility" | "digital";
/** ahead / level / behind the businesses compared; "open" when nobody compared has it; "unknown" when we couldn't compare. */
export type Position = "ahead" | "level" | "behind" | "open" | "unknown";
type Level = 1 | 2 | 3;

export type Signal = { key: string; label: string; position: Position; evidence: string; source: "website check" | "public listing" | "page-by-page read" };
export type Dimension = {
  key: DimKey; name: string; question: string; weight: Level; position: Position; confidence: Level;
  signals: Signal[]; summary: string;
};
export type Implementation = { key: string; text: string; why: string; likelihood: "high" | "medium" | "low"; kpi: string; engine: EngineKey | "foundation" };
export type CapabilityRec = { key: DimKey; name: string; reason: string; implementations: Implementation[]; score: number };
export type Outlook = { trend: string; horizon: "next 1–2 years" | "next 3–5 years"; implication: string; prepare: string; dimension: DimKey; readiness: "ready" | "partly" | "not yet" | "unknown" };
export type Advantage = {
  version: 1; compared: number;
  /** How well the position is supported by comparisons (not by website defects). */
  evidence: { strength: "strong" | "moderate" | "weak"; score: number; note: string; improve: string[] };
  headline: string;
  dimensions: Dimension[];
  losing: DimKey[]; defend: DimKey[]; open: DimKey[];
  capabilities: CapabilityRec[];
  outlook: Outlook[];
};

/** Extra facts beyond the home-page check, when we have them. */
export type AdvantageFacts = {
  name: string; industry: string; prospect: Side; competitors: Side[];
  /** From reading their site page by page. */
  site?: { servicePages: number; prices: boolean } | null;
};

export const DIMENSIONS: Record<DimKey, { name: string; question: string; capability: string }> = {
  reputation: { name: "Reputation and trust", question: "Do people choose them over others when comparing reviews?", capability: "Systematic review generation and reputation management" },
  convenience: { name: "Ease of buying", question: "Can a customer book, buy or get a quote without friction?", capability: "Self-service booking, buying and quoting" },
  responsiveness: { name: "Responsiveness", question: "Do customers get answers when they want them?", capability: "Always-on responses with a fast human hand-over" },
  offer: { name: "Clarity of offer", question: "Can a customer quickly see what they offer, for whom, and at what cost?", capability: "A clear, specialised and transparent offer" },
  visibility: { name: "Discoverability", question: "Do search engines and AI assistants have what they need to recommend them?", capability: "Local search and AI-assistant discoverability" },
  digital: { name: "Digital foundation", question: "Is the website secure, fast, mobile-ready and measured?", capability: "A reliable, measured digital foundation" },
};

// How much each dimension decides who wins customers, by industry. The digital foundation (website
// defects) is always 1: it matters, but it rarely differentiates on its own.
const W = (r: Level, c: Level, s: Level, o: Level, v: Level): Record<DimKey, Level> => ({ reputation: r, convenience: c, responsiveness: s, offer: o, visibility: v, digital: 1 });
const WEIGHTS: Record<string, Record<DimKey, Level>> = {
  healthcare: W(3, 3, 2, 2, 2), professional_services: W(3, 2, 3, 3, 2), real_estate: W(2, 2, 3, 2, 3), hospitality: W(3, 3, 2, 2, 3),
  education: W(3, 2, 2, 3, 2), automotive: W(3, 3, 2, 2, 2), home_services: W(3, 2, 3, 2, 3), manufacturing: W(2, 2, 3, 3, 2),
  it: W(2, 2, 3, 3, 2), retail: W(2, 3, 2, 2, 3),
};
const weightsFor = (industry: string) => WEIGHTS[industry] ?? W(2, 2, 2, 2, 2);
const BOOKING_LED = new Set(["healthcare", "hospitality", "automotive", "education"]);

const usable = (a: Audit | null): a is Audit => !!a && !a.error;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const nearby = (n: number) => `${n} nearby business${n === 1 ? "" : "es"}`;

type Bool = { key: string; dim: DimKey; label: string; test: (a: Audit) => boolean | undefined; only?: (industry: string) => boolean };
const BOOLS: Bool[] = [
  { key: "booking", dim: "convenience", label: "online booking", test: (a) => a.booking, only: (i) => BOOKING_LED.has(i) || !WEIGHTS[i] || i === "home_services" || i === "professional_services" },
  { key: "form", dim: "convenience", label: "an enquiry form on the home page", test: (a) => a.forms > 0 },
  { key: "tel", dim: "convenience", label: "tap-to-call", test: (a) => a.tel },
  { key: "answers", dim: "responsiveness", label: "chat or messaging on the website", test: (a) => a.chat },
  { key: "cta", dim: "responsiveness", label: "a clear next step (call to action)", test: (a) => a.cta.length > 0 },
  { key: "pricing", dim: "offer", label: "published prices or a pricing page", test: (a) => a.pricing },
  { key: "search", dim: "visibility", label: "structured data for search engines and AI assistants", test: (a) => a.schema },
  { key: "description", dim: "visibility", label: "a search description", test: (a) => !!a.description },
  { key: "fresh", dim: "visibility", label: "recently updated content", test: (a) => (a.copyright_year == null ? undefined : a.copyright_year >= new Date().getUTCFullYear() - 2) },
  { key: "https", dim: "digital", label: "a secure connection (HTTPS)", test: (a) => a.https },
  { key: "mobile", dim: "digital", label: "a mobile-ready layout", test: (a) => a.viewport },
  { key: "speed", dim: "digital", label: "a fast first response", test: (a) => a.ms <= 3000 },
  { key: "tracking", dim: "digital", label: "analytics or conversion tracking", test: (a) => a.analytics },
];

/** Compares one yes/no capability with the businesses compared. */
function boolSignal(b: Bool, f: AdvantageFacts): Signal {
  const me = !f.prospect.hasWebsite ? false : usable(f.prospect.audit) ? b.test(f.prospect.audit) : undefined;
  const peers = f.competitors.map((c) => (usable(c.audit) ? b.test(c.audit) : undefined)).filter((v): v is boolean => v !== undefined);
  const have = peers.filter(Boolean).length, n = peers.length;
  const base = { key: b.key, label: b.label, source: "website check" as const };
  if (me === undefined) return { ...base, position: "unknown", evidence: `Couldn't check whether ${f.name} has ${b.label}.` };
  if (!n) return { ...base, position: "unknown", evidence: `${f.name} ${me ? "has" : "doesn't have"} ${b.label}; no nearby business's website was compared.` };
  const them = `${have} of ${nearby(n)} compared ${have === 1 ? "has" : "have"} it`;
  if (me && have / n < 0.5) return { ...base, position: "ahead", evidence: `${f.name} has ${b.label}; only ${them}.` };
  if (!me && have === 0) return { ...base, position: "open", evidence: `Nobody compared has ${b.label}, ${f.name} included: open ground.` };
  if (!me && have / n >= 0.5) return { ...base, position: "behind", evidence: `${f.name} lacks ${b.label}; ${them}.` };
  return { ...base, position: "level", evidence: `${f.name} ${me ? "has" : "lacks"} ${b.label}; ${them}.` };
}

/** Compares a number with the median of the businesses compared (needs at least two). */
function numSignal(key: string, label: string, mine: number | null, theirs: (number | null)[], name: string, source: Signal["source"], unit = ""): Signal {
  const xs = theirs.filter((x): x is number => x != null);
  const base = { key, label, source };
  if (mine == null) return { ...base, position: "unknown", evidence: `${label} for ${name} isn't known.` };
  if (xs.length < 2) return { ...base, position: "unknown", evidence: `${name}: ${mine}${unit} ${label.toLowerCase()}; too few nearby businesses to compare.` };
  const med = median(xs);
  const line = `${name} has ${mine}${unit} ${label.toLowerCase()}; typical among ${nearby(xs.length)} compared: ${med}${unit}.`;
  const ratio = med === 0 ? (mine > 0 ? 2 : 1) : mine / med;
  return { ...base, position: ratio >= 1.25 ? "ahead" : ratio <= 0.75 ? "behind" : "level", evidence: line };
}

function ratingSignal(f: AdvantageFacts): Signal {
  const xs = f.competitors.map((c) => c.rating).filter((x): x is number => x != null);
  const me = f.prospect.rating;
  const base = { key: "rating", label: "Average rating", source: "public listing" as const };
  if (me == null || xs.length < 2) return { ...base, position: "unknown", evidence: me == null ? `Average rating for ${f.name} isn't known.` : `${f.name}'s average public rating: ${me}; too few nearby ratings to compare.` };
  const med = median(xs);
  // Ratings bunch together, so a tenth of a star either way counts as level.
  return { ...base, position: me - med >= 0.2 ? "ahead" : med - me >= 0.2 ? "behind" : "level", evidence: `${f.name}'s average public rating: ${me}; typical among ${nearby(xs.length)} compared: ${med.toFixed(1)}.` };
}

const SCORE: Record<Position, number> = { ahead: 1, level: 0, behind: -1, open: -0.5, unknown: 0 };

function rollUp(key: DimKey, weight: Level, signals: Signal[], name: string): Dimension {
  const known = signals.filter((s) => s.position !== "unknown");
  const meta = DIMENSIONS[key];
  let position: Position = "unknown";
  if (known.length) {
    const avg = known.reduce((s, x) => s + SCORE[x.position], 0) / known.length;
    position = known.every((s) => s.position === "open") ? "open"
      : avg <= -0.3 ? "behind" : avg >= 0.3 ? "ahead" : known.filter((s) => s.position === "open").length * 2 >= known.length ? "open" : "level";
  }
  const confidence: Level = known.length >= 2 && known.length === signals.length ? 3 : known.length ? 2 : 1;
  const lead = { ahead: "ahead of", level: "level with", behind: "behind", open: "on open ground with", unknown: "not yet compared with" }[position];
  return { key, name: meta.name, question: meta.question, weight, position, confidence, signals,
    summary: position === "unknown" ? `${meta.name}: not enough comparable evidence yet.` : `${meta.name}: ${name} is ${lead} the nearby businesses compared.` };
}

// Concrete implementations for each signal a business is behind on (or that nobody offers yet).
const IMPL: Record<string, Omit<Implementation, "why" | "likelihood">> = {
  reviews: { key: "reviews", text: "Automated review requests after every completed visit or job", kpi: "New reviews per month", engine: "retention" },
  rating: { key: "rating", text: "Private feedback step before the public review request, with service recovery for unhappy customers", kpi: "Average rating over time", engine: "retention" },
  booking: { key: "booking", text: "Online booking with qualification questions and instant confirmation", kpi: "Online bookings per month", engine: "sales" },
  form: { key: "form", text: "Short, mobile-first enquiry form on every page, creating a CRM lead", kpi: "Visit-to-enquiry rate", engine: "lead_gen" },
  tel: { key: "tel", text: "Tap-to-call in the header and on every service page", kpi: "Calls from the website", engine: "foundation" },
  answers: { key: "answers", text: "AI concierge trained only on approved business information, with hand-over to staff", kpi: "Assisted conversations that become enquiries", engine: "experience" },
  cta: { key: "cta", text: "One primary call to action repeated through every page", kpi: "Call-to-action click rate", engine: "lead_gen" },
  pricing: { key: "pricing", text: "Published price ranges or a guided quote request", kpi: "Quote requests; quote-to-customer rate", engine: "sales" },
  services: { key: "discovery", text: "A dedicated page for each service, plus a service finder", kpi: "Enquiries per service", engine: "experience" },
  search: { key: "search", text: "Structured data for the business, its services and its FAQ", kpi: "Search impressions and clicks (no ranking is guaranteed)", engine: "search" },
  description: { key: "search", text: "Search descriptions written for each page", kpi: "Search click-through rate", engine: "search" },
  fresh: { key: "fresh", text: "A content calendar for service updates and answers to common questions", kpi: "Pages published per month", engine: "search" },
  https: { key: "https", text: "HTTPS everywhere with automatic certificate renewal", kpi: "Bounce rate", engine: "foundation" },
  mobile: { key: "mobile", text: "Mobile-first layouts", kpi: "Mobile bounce rate", engine: "foundation" },
  speed: { key: "speed", text: "Lightweight, fast pages", kpi: "Page load time", engine: "foundation" },
  tracking: { key: "tracking", text: "Conversion tracking and a KPI dashboard the owner controls", kpi: "Cost per enquiry; enquiries by channel", engine: "insight" },
};

/** The full position, capabilities and outlook for one business. */
export function assessAdvantage(f: AdvantageFacts): Advantage {
  const w = weightsFor(f.industry);
  const compared = f.competitors.filter((c) => usable(c.audit)).length;
  const sig: Record<DimKey, Signal[]> = { reputation: [], convenience: [], responsiveness: [], offer: [], visibility: [], digital: [] };

  sig.reputation.push(numSignal("reviews", "Public reviews", f.prospect.reviews, f.competitors.map((c) => c.reviews), f.name, "public listing"));
  sig.reputation.push(ratingSignal(f));
  for (const b of BOOLS) if (!b.only || b.only(f.industry)) sig[b.dim].push(boolSignal(b, f));
  // How many services they present: from reading the site when we have it, else the home-page navigation.
  const navCount = (s: Side) => (usable(s.audit) ? (s.audit.nav ?? []).length : null);
  const mineServices = f.site ? f.site.servicePages || navCount(f.prospect) : navCount(f.prospect);
  sig.offer.push(numSignal("services", "Services presented", f.prospect.hasWebsite ? mineServices : 0, f.competitors.map(navCount), f.name, f.site ? "page-by-page read" : "website check"));
  if (f.site?.prices) {
    const i = sig.offer.findIndex((s) => s.key === "pricing");
    if (i >= 0 && sig.offer[i].position !== "ahead") sig.offer[i] = { ...sig.offer[i], position: sig.offer[i].position === "behind" || sig.offer[i].position === "open" ? "level" : sig.offer[i].position,
      evidence: `${sig.offer[i].evidence} Prices were found on an inner page.`, source: "page-by-page read" };
  }

  const dimensions = (Object.keys(DIMENSIONS) as DimKey[]).map((k) => rollUp(k, w[k], sig[k], f.name))
    .sort((a, b) => b.weight - a.weight || SCORE[a.position] - SCORE[b.position]);
  const losing = dimensions.filter((d) => d.position === "behind").map((d) => d.key);
  const defend = dimensions.filter((d) => d.position === "ahead").map((d) => d.key);
  const open = dimensions.filter((d) => d.position === "open").map((d) => d.key);

  // Capabilities to build: where they're behind or nobody leads, weighted by what decides this industry.
  const capabilities: CapabilityRec[] = dimensions
    .filter((d) => d.position === "behind" || d.position === "open" || (d.position === "unknown" && d.weight === 3))
    .map((d) => {
      const implementations = d.signals
        .filter((s) => s.position === "behind" || s.position === "open" || (d.position === "unknown" && s.position === "unknown" && IMPL[s.key]))
        .map((s): Implementation | null => {
          const im = IMPL[s.key];
          if (!im) return null;
          const likelihood = s.position === "behind" ? (d.weight === 3 ? "high" : "medium") : s.position === "open" ? (d.weight >= 2 ? "medium" : "low") : "low";
          const why = s.position === "behind" ? `${s.evidence} Customers comparing options can already get this elsewhere.`
            : s.position === "open" ? `${s.evidence} Being first is a differentiator, though untested locally.` : `${s.evidence} Worth confirming before investing.`;
          return { ...im, why, likelihood };
        })
        .filter((x): x is Implementation => !!x)
        .sort((a, b) => RANK[b.likelihood] - RANK[a.likelihood]);
      const mult = d.position === "behind" ? 3 : d.position === "open" ? 2 : 1;
      return { key: d.key, name: DIMENSIONS[d.key].capability, implementations, score: d.weight * mult * d.confidence,
        reason: d.position === "behind" ? `${f.name} is behind on ${d.name.toLowerCase()}, which weighs ${d.weight === 3 ? "heavily" : "moderately"} in how customers choose in this industry.`
          : d.position === "open" ? `Nobody compared leads on ${d.name.toLowerCase()} yet; ${f.name} could own it.`
          : `${d.name} decides a lot in this industry but couldn't be compared yet.` };
    })
    .filter((c) => c.implementations.length)
    .sort((a, b) => b.score - a.score);

  // Evidence strength: how much of the weighted position rests on comparisons, not on our own site check alone.
  const totalW = dimensions.reduce((s, d) => s + d.weight, 0);
  const comparedW = dimensions.reduce((s, d) => s + (d.position === "unknown" ? 0 : d.weight * (d.confidence / 3)), 0);
  const score = Math.round((comparedW / totalW) * 100);
  const improve = [
    compared < 3 && `Compare at least 3 nearby businesses' websites (${compared} so far)`,
    f.competitors.filter((c) => c.reviews != null).length < 2 && "Add competitors from Google Maps so reviews and ratings can be compared",
    f.prospect.rating == null && "Their own Google rating (re-import from Google Maps)",
    !f.site && f.prospect.hasWebsite && "Read their site page by page (runs with the next generation)",
  ].filter((x): x is string => !!x);

  const verdict = losing.length
    ? `${f.name} is losing ground on ${list(losing.map((k) => DIMENSIONS[k].name.toLowerCase()))}`
    : open.length ? `${f.name} is level on the basics, with open ground on ${list(open.map((k) => DIMENSIONS[k].name.toLowerCase()))}`
    : defend.length ? `${f.name} is ahead on ${list(defend.map((k) => DIMENSIONS[k].name.toLowerCase()))}` : `${f.name}'s position couldn't be compared yet`;
  const keep = defend.length && losing.length ? `, and ahead on ${list(defend.map((k) => DIMENSIONS[k].name.toLowerCase()))}` : "";

  return {
    version: 1, compared, dimensions, losing, defend, open, capabilities, outlook: outlook(f.industry, dimensions),
    evidence: { score, strength: score >= 65 ? "strong" : score >= 35 ? "moderate" : "weak", improve,
      note: compared ? `Compared with ${nearby(compared)} on observed website checks and public listings.` : "No nearby business compared yet; positions rest on this business's own check." },
    headline: `${verdict}${keep}.`,
  };
}

const RANK = { high: 3, medium: 2, low: 1 } as const;

// ---------------------------------------------------------------- five-year outlook
// Directions of travel for each industry, written as an outlook, not a forecast: no numbers, no dates
// beyond the horizon, and each tied to what to prepare and how ready this business looks today.

type Trend = Omit<Outlook, "readiness">;
const COMMON: Trend[] = [
  { trend: "AI assistants and AI search increasingly answer local questions directly", horizon: "next 1–2 years", dimension: "visibility",
    implication: "Businesses with clear, structured, accurate information are more likely to be recommended.", prepare: "Publish accurate service, price, hours and FAQ information with structured data, and keep it current." },
  { trend: "Customers expect instant answers and self-service at any hour", horizon: "next 1–2 years", dimension: "responsiveness",
    implication: "Slow replies send customers to whoever answers first.", prepare: "Set up instant acknowledgement, an approved-answers assistant and a clear hand-over to staff." },
  { trend: "Privacy rules tighten and third-party tracking keeps shrinking", horizon: "next 3–5 years", dimension: "digital",
    implication: "Customer data the business collects itself, with consent, becomes the most reliable marketing asset.", prepare: "Own the CRM, collect consent at every enquiry, and measure conversions with first-party analytics." },
];
const BY_INDUSTRY: Record<string, Trend[]> = {
  healthcare: [
    { trend: "Online booking and digital reminders become the default for patients", horizon: "next 1–2 years", dimension: "convenience", implication: "Clinics that only take phone bookings lose patients who search after hours.", prepare: "Online booking with reminders and an easy reschedule path." },
    { trend: "Remote consultations and digital follow-ups where regulations allow", horizon: "next 3–5 years", dimension: "offer", implication: "Patients will compare clinics on convenience of follow-up care, not only location.", prepare: "Decide which follow-ups can be offered remotely and describe them clearly." },
  ],
  professional_services: [
    { trend: "AI tools make routine advice and documents cheaper", horizon: "next 3–5 years", dimension: "offer", implication: "Firms compete less on routine work and more on judgement, speed and specialisation.", prepare: "Define the specialist services and outcomes the firm stands for, with clear scoping and pricing." },
    { trend: "Clients expect online intake and status updates", horizon: "next 1–2 years", dimension: "convenience", implication: "A slow, paper-based start loses clients to firms that onboard in minutes.", prepare: "Online consultation booking and a structured intake form." },
  ],
  real_estate: [
    { trend: "Virtual viewings and richer listing media become standard", horizon: "next 1–2 years", dimension: "offer", implication: "Buyers shortlist from home and visit fewer properties.", prepare: "Video or virtual tours and complete listing details." },
    { trend: "Instant alerts and responses decide who gets the enquiry", horizon: "next 1–2 years", dimension: "responsiveness", implication: "The first agent to respond often wins the client.", prepare: "Instant enquiry routing and saved-search alerts." },
  ],
  hospitality: [
    { trend: "Direct booking competes with platform commissions", horizon: "next 3–5 years", dimension: "convenience", implication: "Venues that make direct booking easy keep more margin and own the guest relationship.", prepare: "A fast direct booking flow and a reason to book direct." },
  ],
  education: [
    { trend: "Hybrid and online learning options keep growing", horizon: "next 3–5 years", dimension: "offer", implication: "Learners compare flexibility as much as location.", prepare: "Describe online or hybrid options clearly, with outcomes and schedules." },
  ],
  automotive: [
    { trend: "Electric and hybrid vehicles change service needs", horizon: "next 3–5 years", dimension: "offer", implication: "Workshops that can't service them lose a growing share of local cars.", prepare: "Plan EV and hybrid servicing capability and say so on the website once offered." },
    { trend: "Online service booking with clear prices", horizon: "next 1–2 years", dimension: "convenience", implication: "Drivers choose workshops they can book and price online.", prepare: "Online booking with fixed-price common services." },
  ],
  home_services: [
    { trend: "Instant quotes from photos and online scheduling", horizon: "next 1–2 years", dimension: "convenience", implication: "Customers book whoever gives a clear price and slot first.", prepare: "A photo-based quote request and online scheduling." },
  ],
  manufacturing: [
    { trend: "Business buyers do most of their research online before contacting sales", horizon: "next 3–5 years", dimension: "offer", implication: "Suppliers without detailed capability and specification pages are left off shortlists.", prepare: "Capability pages, specifications, certifications they actually hold, and an RFQ form." },
  ],
  it: [
    { trend: "AI changes what clients buy from IT providers", horizon: "next 3–5 years", dimension: "offer", implication: "Generic services commoditise; specialised, outcome-based offers stand out.", prepare: "Package services around outcomes, with clear scope and engagement models." },
  ],
  retail: [
    { trend: "Shoppers check stock and order online before visiting", horizon: "next 1–2 years", dimension: "convenience", implication: "Stores that show availability and offer click-and-collect win the visit.", prepare: "Show key products and availability online, with reserve or collect options." },
  ],
};

function outlook(industry: string, dims: Dimension[]): Outlook[] {
  const pos = (k: DimKey) => dims.find((d) => d.key === k)?.position ?? "unknown";
  const ready = (p: Position): Outlook["readiness"] => (p === "ahead" ? "ready" : p === "level" ? "partly" : p === "unknown" ? "unknown" : "not yet");
  return [...(BY_INDUSTRY[industry] ?? []), ...COMMON].map((t) => ({ ...t, readiness: ready(pos(t.dimension)) }));
}

/** Gap keys of the growth plan that close a competitive gap, with the dimension's weight. */
export function differentiators(a: Advantage): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of a.dimensions) {
    if (d.position !== "behind" && d.position !== "open") continue;
    for (const s of d.signals) {
      if (s.position !== "behind" && s.position !== "open") continue;
      const key = IMPL[s.key]?.key ?? s.key;
      m.set(key, Math.max(m.get(key) ?? 0, d.weight * (s.position === "behind" ? 2 : 1)));
    }
  }
  return m;
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
