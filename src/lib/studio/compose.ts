// Stages 3–8 of preview generation: gaps, Growth Engines, content and validation. Pure and
// deterministic, so a run costs nothing and can be repeated; each stage reports what it actually did.
import type { Side } from "./competitors";
import { buildPlan, clientGrowth, type EngineKey, type GrowthPlan } from "./growth";
import { buildSite, focusEngine, pickDesign, validateSite, withGrowth, type Sections, type SiteContent, type SiteFacts } from "./site";

export type StageKey = "context" | "research" | "gaps" | "engines" | "content" | "validate" | "save";
export type StageStatus = "done" | "partial" | "skipped" | "failed";
export type Stage = { key: StageKey; status: StageStatus; note: string };
export const STAGES: { key: StageKey; label: string }[] = [
  { key: "context", label: "Prospect context" },
  { key: "research", label: "Website research" },
  { key: "gaps", label: "Gap analysis" },
  { key: "engines", label: "Growth Engine selection" },
  { key: "content", label: "Content generation" },
  { key: "validate", label: "Preview validation" },
  { key: "save", label: "Saved" },
];

export type ComposeInput = {
  facts: SiteFacts; reviews: number | null; competitors: Side[];
  /** Names of the other businesses in the campaign; the preview must not mention any of them. */
  others: string[];
  /** "site" rebuilds everything; "plan" keeps the existing text and refreshes only the growth layer. */
  mode: "site" | "plan"; existing?: SiteContent | null;
  focus?: EngineKey | null; segment?: string | null; sections?: Partial<Sections>;
  now?: Date;
};
export type Composed = { ok: true; content: SiteContent; plan: GrowthPlan; design: ReturnType<typeof pickDesign>; stages: Stage[]; warnings: string[] }
  | { ok: false; stages: Stage[]; error: string };

export function compose(x: ComposeInput): Composed {
  const f = x.facts;
  const services = (f.audit && !f.audit.error ? f.audit.nav ?? [] : []).slice(0, 6);
  const growthFacts = {
    name: f.name, industry: f.industry, industryLabel: f.industryLabel, category: f.category, city: f.city, website: f.website, audit: f.audit,
    phone: f.phone, email: f.email, address: f.address, reviews: x.reviews, services, competitors: x.competitors,
  };
  const plan = buildPlan(growthFacts, { focus: x.focus, now: x.now });
  const stages: Stage[] = [];
  const observed = plan.gaps.filter((g) => g.basis !== "industry").length;
  stages.push({ key: "gaps", status: observed ? "done" : "partial",
    note: `${plan.gaps.length} gap(s): ${observed} observed, ${plan.gaps.length - observed} industry recommendation(s)${observed ? "" : "; nothing could be observed, so the plan rests on assumptions"}.` });
  stages.push({ key: "engines", status: plan.engines.length ? "done" : "failed", note: plan.engines.filter((e) => e.primary).map((e) => e.name).join(", ") || "No engine matched" });

  const keep = x.mode === "plan" && x.existing?.brand;
  const base = keep ? x.existing! : buildSite(f);
  let g = clientGrowth(plan, growthFacts, { segment: x.segment ?? x.existing?.growth?.segment ?? null, focus: x.focus ?? x.existing?.growth?.focus ?? null });
  g = focusEngine(g, g.focus);
  const content = withGrowth(base, g, { keepHero: !!keep, sections: x.sections });
  stages.push({ key: "content", status: "done", note: keep ? "Growth plan, FAQ and demos refreshed; your text edits were kept." : "Website, growth plan, FAQ and demos built from the facts held." });

  const problems = validateSite(content, x.others.filter((n) => n.trim().toLowerCase() !== f.name.trim().toLowerCase()));
  const fatal = problems.filter((p) => !p.startsWith("Unsupported trust claim"));
  if (fatal.length || !plan.engines.length) {
    stages.push({ key: "validate", status: "failed", note: fatal.join("; ") || "No Growth Engines" });
    return { ok: false, stages, error: `Preview failed validation: ${fatal.join("; ") || "no Growth Engines"}.` };
  }
  const warnings = problems.filter((p) => p.startsWith("Unsupported trust claim")).map((p) => `${p} (check where it came from before sharing)`);
  stages.push({ key: "validate", status: warnings.length ? "partial" : "done", note: warnings.length ? warnings.join("; ") : "Content complete, no unsupported claims, no other business mentioned." });
  return { ok: true, content, plan, design: pickDesign(f), stages, warnings };
}

// ---------------------------------------------------------------- refinements

export const REFINEMENTS = {
  premium: "Make it more premium",
  hero: "Improve the hero section",
  lead_gen: "Strengthen lead generation",
  sales: "Prioritise AI Sales Conversion",
  automation: "Add industry-specific automation",
  differentiation: "Improve competitive differentiation",
  segment: "Rewrite for a customer segment",
  reduce: "Reduce unnecessary sections",
} as const;
export type Refinement = keyof typeof REFINEMENTS;

type Refined = { content: SiteContent; theme?: string; layout?: "split" | "centered"; ok: string } | { error: string };

/**
 * Applies one refinement to one preview's content. Deterministic rules, not AI rewriting: each one
 * changes design, emphasis or section choice, and never adds facts the business hasn't published.
 */
export function refine(c: SiteContent, what: Refinement, opts: { name: string; heroTemplate: string; segment?: string | null }): Refined {
  const g = c.growth;
  if (!g) return { error: "Add the growth plan first (Rebuild growth plan)." };
  const sections = { ...(c.sections ?? { assistant: true, finder: true, qualify: true, faq: true, differentiation: false }) };
  switch (what) {
    case "premium":
      return { content: c, theme: "atelier", layout: "centered", ok: "Switched to the premium Atelier style with a centred hero." };
    case "hero":
      return { content: { ...c, hero: { ...c.hero, headline: opts.heroTemplate.replace("{name}", opts.name).slice(0, 120), sub: `${g.segment ? `For ${g.segment}: ` : ""}${g.promise}` } }, ok: "Hero rewritten around the main action, using only the facts held." };
    case "lead_gen":
      return { content: { ...c, growth: focusEngine(g, "lead_gen"), sections: { ...sections, finder: (c.finder?.options.length ?? 0) >= 2, qualify: true, assistant: true } }, ok: "Lead generation moved first; service finder, qualifying form and concierge turned on." };
    case "sales":
      if (!g.engines.some((e) => e.key === "sales")) return { error: "No sales-conversion gap was found for this business, so that engine isn't in its plan." };
      return { content: { ...c, growth: focusEngine(g, "sales"), sections: { ...sections, qualify: true } }, ok: "AI Sales Conversion moved first." };
    case "automation":
      if (!g.engines.some((e) => e.key === "operations")) return { error: "No automation engine in this plan." };
      return { content: { ...c, growth: focusEngine(g, "operations") }, ok: "Operational automation moved first." };
    case "differentiation":
      if (!g.differentiation.length && !g.strengths.length) return { error: "No supportable differences yet. Compare competitors first, then rebuild the growth plan." };
      return { content: { ...c, sections: { ...sections, differentiation: true } }, ok: "Differentiation section turned on, based on the competitor comparison." };
    case "segment": {
      const seg = (opts.segment ?? "").replace(/[\[\]<>{}]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
      const base = c.hero.sub.replace(/^For [^:]{1,60}: /, "");
      if (!seg) return { content: { ...c, growth: { ...g, segment: null }, hero: { ...c.hero, sub: base } }, ok: "Segment removed." };
      return { content: { ...c, growth: { ...g, segment: seg }, hero: { ...c.hero, sub: `For ${seg}: ${base}`.slice(0, 300) } }, ok: `Hero and plan now address ${seg}.` };
    }
    case "reduce":
      return { content: { ...c, sections: { ...sections, finder: (c.finder?.options.length ?? 0) >= 3 && sections.finder, differentiation: g.differentiation.length + g.strengths.length >= 2 && sections.differentiation } }, ok: "Sections with little supporting information were turned off." };
  }
}
