// Competitor comparison from observed website checks and listing facts. Pure functions, no AI.
// Each insight says whether it is an observed fact or a strategic assumption drawn from facts.
import type { Audit } from "@/lib/discovery/prospects";

export type Side = { name: string; audit: Audit | null; reviews: number | null; rating: number | null; hasWebsite: boolean };

type Feature = { key: string; action: string; label: string; test: (a: Audit) => boolean; lever: "conversion" | "traffic" | "trust"; gain: string; need: string };

const YEAR = new Date().getUTCFullYear();

export const FEATURES: Feature[] = [
  { key: "booking", action: "Add online booking", label: "Online booking", test: (a) => a.booking, lever: "conversion", gain: "Lets visitors book without calling, including outside office hours", need: "Customers who want to book outside office hours" },
  { key: "form", action: "Add an inquiry form to the home page", label: "Inquiry form on the home page", test: (a) => a.forms > 0, lever: "conversion", gain: "Captures inquiries from visitors who won't phone", need: "Visitors who prefer to write rather than call" },
  { key: "cta", action: "Add a clear call to action", label: "Clear call to action", test: (a) => a.cta.length > 0, lever: "conversion", gain: "Tells visitors the next step", need: "Visitors unsure how to start" },
  { key: "tel", action: "Make the phone number tap-to-call", label: "Tap-to-call phone number", test: (a) => a.tel, lever: "conversion", gain: "One tap to call from a phone", need: "Mobile visitors ready to call" },
  { key: "mobile", action: "Make the site work on mobile screens", label: "Built for mobile screens", test: (a) => a.viewport, lever: "conversion", gain: "Readable on phones without zooming", need: "Visitors on phones" },
  { key: "https", action: "Serve the site over HTTPS", label: "Secure connection (HTTPS)", test: (a) => a.https, lever: "trust", gain: "Avoids browser \"not secure\" warnings", need: "Visitors wary of security warnings" },
  { key: "speed", action: "Speed up the first page load", label: "Fast first response (≤ 3 s)", test: (a) => a.ms <= 3000, lever: "conversion", gain: "Fewer visitors leave while the page loads", need: "Visitors on slow connections" },
  { key: "pricing", action: "Show prices or a pricing page", label: "Shows prices or a pricing page", test: (a) => !!a.pricing, lever: "conversion", gain: "Lets visitors qualify themselves before contacting", need: "Buyers comparing costs before they inquire" },
  { key: "description", action: "Write a search description", label: "Search description (meta description)", test: (a) => !!a.description, lever: "traffic", gain: "Controls the text shown in search results", need: "Searchers choosing which result to open" },
  { key: "schema", action: "Add structured data for search engines", label: "Structured data for search engines", test: (a) => a.schema, lever: "traffic", gain: "Helps search engines show business details", need: "Searchers looking for local details" },
  { key: "fresh", action: "Refresh the site and its copyright notice", label: "Recently updated (copyright within 2 years)", test: (a) => a.copyright_year != null && a.copyright_year >= YEAR - 2, lever: "trust", gain: "Signals the business is active", need: "Visitors checking the business is current" },
];

export type Matrix = { key: string; label: string; prospect: boolean | null; competitors: (boolean | null)[]; share: number | null }[];

const usable = (a: Audit | null): a is Audit => !!a && !a.error;

export function featureMatrix(prospect: Side, competitors: Side[]): Matrix {
  return FEATURES.map((f) => {
    const vals = competitors.map((c) => (usable(c.audit) ? f.test(c.audit) : null));
    const known = vals.filter((v) => v != null);
    return {
      key: f.key, label: f.label, prospect: usable(prospect.audit) ? f.test(prospect.audit) : prospect.hasWebsite ? null : false,
      competitors: vals, share: known.length ? known.filter(Boolean).length / known.length : null,
    };
  });
}

export type Insight = { text: string; kind: "fact" | "assumption" };
export type Recommendation = { text: string; why: string; lever: Feature["lever"]; measure: string };
export type Analysis = {
  compared: number; strengths: Insight[]; advantages: Insight[]; unserved: Insight[]; differentiation: Insight[]; recommendations: Recommendation[];
};

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const MEASURE: Record<Feature["lever"], string> = {
  conversion: "visit-to-inquiry rate (the conversion change in the financial model)",
  traffic: "search impressions and visits (the traffic change in the financial model)",
  trust: "inquiry rate and bounce rate before and after",
};

export function analyse(prospect: Side, competitors: Side[]): Analysis {
  const audited = competitors.filter((c) => usable(c.audit));
  const m = featureMatrix(prospect, competitors);
  const n = audited.length;
  const out: Analysis = { compared: n, strengths: [], advantages: [], unserved: [], differentiation: [], recommendations: [] };
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const feat: { share: number; rec: Recommendation }[] = [];

  for (const row of m) {
    const f = FEATURES.find((x) => x.key === row.key)!;
    if (row.share == null) continue;
    const have = Math.round(row.share * n);
    if (row.prospect === true && row.share < 0.5) out.strengths.push({ kind: "fact", text: `${f.label}: ${prospect.name} has it; ${have} of ${n} competitors do.` });
    if (row.prospect === false && row.share >= 0.5) out.advantages.push({ kind: "fact", text: `${f.label}: ${have} of ${n} competitors (${pct(row.share)}) have it; ${prospect.name} does not.` });
    if (row.prospect === false && row.share === 0) {
      out.unserved.push({ kind: "fact", text: `None of the ${n} compared businesses, including ${prospect.name}, has ${f.label.toLowerCase()}.` });
      out.unserved.push({ kind: "assumption", text: `${f.need} are not served by any business here.` });
      out.differentiation.push({ kind: "assumption", text: `Be the first in this comparison with ${f.label.toLowerCase()}.` });
    }
    if (row.prospect === false) {
      feat.push({ share: row.share, rec: {
        text: f.action, lever: f.lever, measure: MEASURE[f.lever],
        why: `${f.gain}. ${row.share > 0 ? `${have} of ${n} competitors already offer it.` : "No compared competitor offers it yet."}`,
      } });
    }
  }
  // Close the most common gaps first.
  out.recommendations = feat.sort((a, b) => b.share - a.share).map((x) => x.rec);
  if (!prospect.hasWebsite) {
    out.advantages.unshift({ kind: "fact", text: `${prospect.name} has no website listed; ${competitors.filter((c) => c.hasWebsite).length} of ${competitors.length} competitors do.` });
    out.recommendations.unshift({ text: "Launch a website", lever: "traffic", measure: MEASURE.traffic, why: "Visitors searching online currently find competitors only." });
  }

  const rev = competitors.map((c) => c.reviews).filter((x): x is number => x != null);
  if (prospect.reviews != null && rev.length >= 2) {
    const med = median(rev);
    const line = `${prospect.name} has ${prospect.reviews} public reviews; the competitor median is ${med}.`;
    if (prospect.reviews >= med) out.strengths.push({ kind: "fact", text: line });
    else {
      out.advantages.push({ kind: "fact", text: line });
      out.recommendations.push({ text: "Ask happy customers for reviews", lever: "trust", measure: "review count and rating over time", why: "Competitors show more public feedback, which searchers use to choose." });
    }
  }
  return out;
}
