// Domain ideas and scoring. Pure functions: no network, no AI, same input → same output.
import { COUNTRY_TLD, KNOWN_MARKS, MODIFIERS, type Keyword } from "./keywords";

export const slug = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

export function splitDomain(name: string) {
  const n = name.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const i = n.indexOf(".");
  return i > 0 ? { sld: n.slice(0, i), tld: n.slice(i) } : null;
}

export const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9-]{2,63})+$/;

export type Idea = { name: string; tld: string; keywords: string[] };

/** Candidate names from industry words × location × modifiers, best patterns first, deduplicated. */
export function generateIdeas(input: { keywords: Keyword[]; city?: string | null; region?: string | null; extensions: string[]; limit: number }): Idea[] {
  const places = [...new Set([slug(input.city), slug(input.region)].filter((p) => p && p.length <= 14))];
  const words = [...input.keywords].sort((a, b) => b.intent - a.intent).map((k) => k.word);
  const slds: [string, string[]][] = [];
  const add = (sld: string, kws: string[]) => { if (sld.length >= 4 && sld.length <= 24) slds.push([sld, kws]); };
  for (const w of words) for (const p of places) { add(p + w, [w, p]); add(w + p, [w, p]); }
  for (const w of words) for (const m of MODIFIERS.suffix) add(w + m, [w]);
  for (const w of words) for (const p of places) for (const m of MODIFIERS.prefix) add(m + p + w, [w, p]);
  for (const w of words) for (const m of MODIFIERS.prefix) add(m + w, [w]);

  const out: Idea[] = [];
  const seen = new Set<string>();
  // Spread across extensions: every extension gets the strongest names before weaker ones.
  for (const [sld, kws] of slds) {
    for (const tld of input.extensions) {
      const name = sld + tld;
      if (seen.has(name) || !DOMAIN_RE.test(name)) continue;
      seen.add(name);
      out.push({ name, tld, keywords: kws });
      if (out.length >= input.limit) return out;
    }
  }
  return out;
}

export type Component = { key: string; label: string; weight: number; score: number | null; note: string };
export type ScoreResult = { score: number; confidence: number; components: Component[]; flags: string[] };

export type DomainFacts = {
  name: string; tld: string; keywords: string[];
  industryWords: Keyword[]; city?: string | null; region?: string | null; country: string;
  registryStatus: string; price: number | null; renewal: number | null; budgetPerDomain: number | null;
  comparables: number[];
};

const VOWELS = /[aeiouy]/g;

/** 0–100 score. Components without data are left out and lower the confidence instead of guessing. */
export function scoreDomain(f: DomainFacts): ScoreResult {
  const sld = f.name.slice(0, f.name.length - f.tld.length);
  const flags: string[] = [];
  const c: Component[] = [];

  // Commercial demand: strongest buyer-intent word present (editorial weights, not search volume).
  const hits = f.industryWords.filter((k) => sld.includes(k.word));
  const intent = Math.max(0, ...hits.map((k) => k.intent));
  c.push({ key: "demand", label: "Commercial demand", weight: 20, score: hits.length ? Math.round((intent / 3) * 100) : 20,
    note: hits.length ? `Contains "${hits.map((h) => h.word).join('", "')}" (buyer-intent ${intent}/3, editorial estimate)` : "No industry buyer-intent word" });

  // Brandability: short, pronounceable, no digits or hyphens.
  let b = 100;
  if (sld.length > 15) b -= Math.min(45, (sld.length - 15) * 6);
  else if (sld.length <= 10) b += 0; else b -= (sld.length - 10) * 3;
  if (/\d/.test(sld)) b -= 25;
  if (sld.includes("-")) b -= 25;
  const vr = (sld.match(VOWELS)?.length ?? 0) / sld.length;
  if (vr < 0.25 || vr > 0.65) b -= 15;
  if (/(.)\1\1/.test(sld)) b -= 10;
  c.push({ key: "brand", label: "Brandability", weight: 15, score: clamp(b), note: `${sld.length} characters${/\d|-/.test(sld) ? ", digits or hyphens" : ""}` });

  // Relevance: industry word and location both present.
  const place = [slug(f.city), slug(f.region)].filter(Boolean).find((p) => sld.includes(p!));
  c.push({ key: "relevance", label: "Industry & location relevance", weight: 15, score: (hits.length ? 60 : 10) + (place ? 40 : 0),
    note: [hits.length ? "industry word" : "no industry word", place ? `location "${place}"` : "no location"].join(", ") });

  // Search opportunity needs keyword-volume data; not connected in Phase 2.
  c.push({ key: "search", label: "Search opportunity", weight: 10, score: null, note: "No keyword-volume source connected" });

  // Comparable sales: only user-entered, sourced comparables.
  c.push({ key: "comparables", label: "Comparable sales evidence", weight: 10,
    score: f.comparables.length ? Math.min(100, 40 + f.comparables.length * 20) : null,
    note: f.comparables.length ? `${f.comparables.length} sourced comparable sale(s)` : "No comparable sales recorded" });

  // Affordability: first-year price against the campaign's per-domain budget.
  let afford: number | null = null;
  if (f.registryStatus === "registered") { afford = 0; flags.push("Registered: only purchasable from its current owner"); }
  else if (f.price != null && f.budgetPerDomain) afford = clamp(100 - Math.max(0, (f.price / f.budgetPerDomain - 0.2) * 125));
  c.push({ key: "afford", label: "Affordability", weight: 10, score: afford,
    note: f.registryStatus === "registered" ? "Already registered" : f.price != null ? `Price ${f.price} vs budget ${f.budgetPerDomain ?? "not set"}` : "No verified price" });

  // Extension suitability.
  const cc = COUNTRY_TLD[f.country];
  const ext = f.tld === ".com" ? 100 : f.tld === cc ? 95 : [".co", ".io", ".ai", ".app"].includes(f.tld) ? 65 : [".net", ".org"].includes(f.tld) ? 55 : 45;
  c.push({ key: "extension", label: "Extension suitability", weight: 10, score: ext, note: f.tld === cc ? `${f.tld} matches ${f.country}` : f.tld });

  // Legal risk (higher score = lower risk). A clean result is not a trademark clearance.
  const mark = KNOWN_MARKS.find((m) => sld.includes(m));
  if (mark) flags.push(`Contains the well-known mark "${mark}"`);
  flags.push("Trademark search not performed: verify before buying");
  c.push({ key: "legal", label: "Legal & trademark risk", weight: 10, score: mark ? 0 : 80, note: mark ? `Contains "${mark}"` : "No well-known mark found (not a clearance)" });

  const known = c.filter((x) => x.score != null);
  const wsum = known.reduce((s, x) => s + x.weight, 0);
  const total = c.reduce((s, x) => s + x.weight, 0);
  let score = wsum ? known.reduce((s, x) => s + x.score! * x.weight, 0) / wsum : 0;
  if (mark) score = Math.min(score, 30);
  if (f.registryStatus === "registered") score = Math.min(score, 40);
  const confidence = Math.round((wsum / total) * (f.registryStatus === "unchecked" || f.registryStatus === "error" ? 0.8 : 1) * 100);
  return { score: Math.round(score), confidence, components: c, flags };
}

/** Value range from sourced comparables only; null when there is no evidence. */
export function valuation(comparables: number[]) {
  if (!comparables.length) return null;
  const s = [...comparables].sort((a, b) => a - b);
  const q = (p: number) => {
    const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  };
  return { low: q(0.25), mid: q(0.5), high: q(0.75), n: s.length };
}

/** Holding cost and resale ROI scenarios. Needs a price and comparables; otherwise null. */
export function roiScenarios(price: number | null, renewal: number | null, comparables: number[], years = 2) {
  const v = valuation(comparables);
  if (price == null || !v) return null;
  const cost = price + (renewal ?? price) * Math.max(0, years - 1);
  const row = (label: string, sale: number) => ({ label, sale, profit: sale - cost, roi: cost > 0 ? (sale - cost) / cost : null });
  return { years, cost, rows: [row("Conservative", v.low), row("Base", v.mid), row("Upside", v.high)] };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
