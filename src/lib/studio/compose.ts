// Stages 3–8 of preview generation: gaps, Growth Engines, content and validation. Pure and
// deterministic, so a run costs nothing and can be repeated; each stage reports what it actually did.
import type { Side } from "./competitors";
import { buildPlan, clientGrowth, type EngineKey, type GrowthPlan } from "./growth";
import { buildSite, focusEngine, pickDesign, validateSite, withGrowth, type Sections, type SiteContent, type SiteFacts } from "./site";
import { buildBlueprint, type Blueprint } from "./blueprint";
import type { Inventory } from "./inventory";
import { qualityGate } from "./quality";

export type StageKey = "context" | "research" | "inventory" | "position" | "gaps" | "engines" | "blueprint" | "content" | "validate" | "save";
export type StageStatus = "done" | "partial" | "skipped" | "failed";
export type Stage = { key: StageKey; status: StageStatus; note: string };
export const STAGES: { key: StageKey; label: string }[] = [
  { key: "context", label: "Prospect context" },
  { key: "research", label: "Website research" },
  { key: "inventory", label: "Website page inventory" },
  { key: "position", label: "Competitive position" },
  { key: "gaps", label: "Gap analysis" },
  { key: "engines", label: "Growth Engine selection" },
  { key: "blueprint", label: "Content and feature blueprint" },
  { key: "content", label: "Content generation" },
  { key: "validate", label: "Preview validation" },
  { key: "save", label: "Saved" },
];

export type ComposeInput = {
  facts: SiteFacts; reviews: number | null; competitors: Side[]; rating?: number | null;
  /** Names of the other businesses in the campaign; the preview must not mention any of them. */
  others: string[];
  /** "site" rebuilds everything; "plan" keeps the existing text and refreshes only the growth layer. */
  mode: "site" | "plan"; existing?: SiteContent | null;
  focus?: EngineKey | null; segment?: string | null; sections?: Partial<Sections>;
  /** Pages read from their website; null when it hasn't been read yet. */
  inventory?: Inventory | null;
  /** The saved Growth Plan. In "site" mode it is the source of truth and is not regenerated. */
  savedPlan?: GrowthPlan | null;
  now?: Date;
};
export type Composed = { ok: true; content: SiteContent; plan: GrowthPlan; blueprint: Blueprint; design: ReturnType<typeof pickDesign>; stages: Stage[]; warnings: string[] }
  | { ok: false; stages: Stage[]; error: string };

export function compose(x: ComposeInput): Composed {
  const f = x.facts;
  const services = (f.audit && !f.audit.error ? f.audit.nav ?? [] : []).slice(0, 6);
  const growthFacts = {
    name: f.name, industry: f.industry, industryLabel: f.industryLabel, category: f.category, city: f.city, website: f.website, audit: f.audit,
    phone: f.phone, email: f.email, address: f.address, reviews: x.reviews, services, competitors: x.competitors, rating: x.rating ?? null,
    site: x.inventory ? { servicePages: x.inventory.pages.filter((p) => p.status === "extracted" && (p.kind === "service" || p.kind === "product")).length, prices: x.inventory.pages.some((p) => p.prices.length > 0) } : null,
  };
  const reuse = x.mode === "site" && !!x.savedPlan?.gaps?.length && !x.focus;
  let plan = reuse ? x.savedPlan! : buildPlan(growthFacts, { focus: x.focus, now: x.now });
  // A plan saved before competitive positions existed keeps its gaps; only the position is added.
  if (!plan.advantage) plan = { ...plan, advantage: buildPlan(growthFacts, { now: x.now }).advantage };
  const stages: Stage[] = [];
  const adv = plan.advantage!;
  stages.push({ key: "position", status: adv.evidence.strength === "weak" ? "partial" : "done",
    note: `${adv.headline} Evidence ${adv.evidence.strength} (${adv.evidence.score}/100). ${adv.evidence.note}`.slice(0, 300) });
  const observed = plan.gaps.filter((g) => g.basis !== "industry").length;
  stages.push({ key: "gaps", status: observed ? "done" : "partial",
    note: `${reuse ? `Saved Growth Plan from ${plan.built_at.slice(0, 10)} used as the source of truth. ` : ""}${plan.gaps.length} gap(s): ${observed} observed, ${plan.gaps.length - observed} industry recommendation(s)${observed ? "" : "; nothing could be observed, so the plan rests on assumptions"}.` });
  stages.push({ key: "engines", status: plan.engines.length ? "done" : "failed", note: plan.engines.filter((e) => e.primary).map((e) => e.name).join(", ") || "No engine matched" });

  const keep = x.mode === "plan" && x.existing?.brand;
  const base = keep ? x.existing! : buildSite(f);
  let g = clientGrowth(plan, growthFacts, { segment: x.segment ?? x.existing?.growth?.segment ?? null, focus: x.focus ?? x.existing?.growth?.focus ?? null });
  g = focusEngine(g, g.focus);
  const grown = withGrowth(base, g, { keepHero: !!keep, sections: x.sections });
  const bp = buildBlueprint(x.inventory ?? null, plan, { name: f.name, industry: f.industry, primaryCta: grown.hero.primary_cta, booking: grown.booking, hasPhone: !!f.phone }, x.others, x.now);
  const applied = applyBlueprint(grown, bp, x.inventory ?? null, !!keep);
  const content: SiteContent = { ...applied, industry: f.industry,
    proof: { rating: x.rating != null ? { value: x.rating, count: x.reviews, source: "Google Maps listing" } : null } };
  const count = (k: string) => bp.originals.filter((o) => o.action === k).length;
  const fcount = (k: string) => bp.features.filter((o) => o.status === k).length;
  // Items for the team to review are notes, not a shortfall. The blueprint fell short only when their site wasn't
  // read, a plan item couldn't be placed, or much of their readable content had to be left out.
  const readable = bp.originals.filter((o) => o.extraction === "extracted" && !["legal", "account"].includes(o.kind));
  const lost = readable.filter((o) => o.action === "excluded").length;
  const unplaced = bp.features.filter((x) => x.page === "—" && x.status === "review").length;
  const short = (!!f.website && !bp.originals.length) || unplaced > 0 || lost * 10 > readable.length * 3;
  stages.push({ key: "blueprint", status: short ? "partial" : "done",
    note: `${bp.originals.length ? `${bp.originals.length} original page(s): ${count("improved")} improved, ${count("preserved")} preserved, ${count("merged")} merged, ${count("replaced")} replaced, ${count("excluded")} excluded` : f.website ? "Their website hasn't been read page by page" : "No existing website to preserve; built from the listing and the plan"}. ${bp.features.length} plan item(s): ${fcount("implemented")} built, ${fcount("simulated")} simulated, ${fcount("proposed")} proposed, ${fcount("review")} to review. ${bp.pages.length} page(s) in the proposed site.${unplaced ? ` ${unplaced} plan item(s) need a page chosen by hand.` : ""}${bp.review.length ? ` ${bp.review.length} note(s) to review in the studio.` : ""}` });
  stages.push({ key: "content", status: "done", note: keep ? "Growth plan, FAQ and demos refreshed; your text edits were kept." : "Website, growth plan, FAQ and demos built from the facts held." });

  const problems = validateSite(content, x.others.filter((n) => n.trim().toLowerCase() !== f.name.trim().toLowerCase()));
  const fatal = problems.filter((p) => !p.startsWith("Unsupported trust claim"));
  if (fatal.length || !plan.engines.length) {
    stages.push({ key: "validate", status: "failed", note: fatal.join("; ") || "No Growth Engines" });
    return { ok: false, stages, error: `Preview failed validation: ${fatal.join("; ") || "no Growth Engines"}.` };
  }
  const warnings = problems.filter((p) => p.startsWith("Unsupported trust claim")).map((p) => `${p} (check where it came from before sharing)`);
  const q = qualityGate(content, { blueprint: bp, others: x.others.filter((n) => n.trim().toLowerCase() !== f.name.trim().toLowerCase()) });
  const failed = q.checks.filter((c) => c.status === "fail").map((c) => c.label);
  stages.push({ key: "validate", status: warnings.length || failed.length ? "partial" : "done",
    note: `Quality gate ${q.summary}${failed.length ? ` Failed: ${failed.join("; ")}.` : ""}${warnings.length ? ` ${warnings.join("; ")}` : ""}`.slice(0, 300) });
  return { ok: true, content, plan, blueprint: bp, design: pickDesign(f), stages, warnings };
}

/** Puts the blueprint's pages, the business's own services and brand into the site content. */
function applyBlueprint(c: SiteContent, bp: Blueprint, inv: Inventory | null, keepText: boolean): SiteContent {
  const fromPages = bp.services.filter((s) => s.slug);
  const services = !keepText && fromPages.length
    ? fromPages.map((s) => ({ title: s.title, text: s.text, source: "website" as const, slug: s.slug }))
    : c.services.map((s) => ({ ...s, slug: fromPages.find((x) => x.title.toLowerCase() === s.title.toLowerCase())?.slug ?? s.slug ?? null }));
  const about = inv?.pages.find((p) => p.kind === "about" && p.paragraphs.length)?.paragraphs[0];
  const brand = inv ? { ...c.brand, logo: inv.brand.logo, colors: inv.brand.accent ? { accent: inv.brand.accent, ink: inv.brand.ink } : null, social: inv.brand.social ?? [], image: inv.brand.image ?? null } : c.brand;
  // Their own home-page headline and description lead, when they read as a headline.
  const homeRec = inv?.pages.find((p) => p.kind === "home" && p.status === "extracted");
  const h1 = homeRec?.h1?.trim();
  const hero = !keepText && h1 && h1.length >= 12 && h1.length <= 90 && h1.toLowerCase() !== c.brand.name.toLowerCase() && !/\[\[/.test(h1)
    ? { ...c.hero, headline: h1, sub: homeRec?.description && homeRec.description.length <= 240 ? homeRec.description : c.hero.sub } : c.hero;
  return {
    ...c, brand, hero, services, pages: bp.pages,
    about: !keepText && about && /\[\[/.test(c.about) ? about : c.about,
    sources: inv ? [...c.sources.filter((x) => x.label !== "Pages read from their website"), { label: "Pages read from their website", url: inv.root }] : c.sources,
  };
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
      return { content: c, theme: "corporate", layout: "split", ok: "Switched to the Premium Corporate direction: split hero with a proof panel and restrained colour." };
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
