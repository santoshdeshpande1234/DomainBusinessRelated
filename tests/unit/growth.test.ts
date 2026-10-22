import { describe, expect, it } from "vitest";
import { buildPlan, clientGrowth, findGaps, type GrowthFacts } from "@/lib/studio/growth";
import { compose, refine, type ComposeInput } from "@/lib/studio/compose";
import { validateSite, type SiteFacts } from "@/lib/studio/site";
import { parseAudit, type Audit } from "@/lib/discovery/prospects";
import type { Side } from "@/lib/studio/competitors";

const audit = (o: Partial<Audit> = {}): Audit => ({
  url: "", final_url: "https://smile.example/", status: 200, https: true, ms: 800, kb: 50, title: "x", description: "Family dentist", viewport: true, h1: 1,
  forms: 1, booking: false, cta: ["contact us"], tel: true, emails: [], schema: false, copyright_year: 2025, generator: null, pricing: false,
  nav: ["Dental implants", "Braces", "Teeth whitening"], headings: [], analytics: false, chat: false, ...o,
});
const rivals: Side[] = [
  { name: "Bright Teeth Clinic", audit: audit({ booking: true, forms: 1 }), reviews: 120, rating: 4.8, hasWebsite: true },
  { name: "Pune Dental Care", audit: audit({ booking: true, forms: 1 }), reviews: 80, rating: 4.6, hasWebsite: true },
];
const facts = (o: Partial<GrowthFacts> = {}): GrowthFacts => ({
  name: "Smile Studio", industry: "healthcare", industryLabel: "Healthcare", category: "Dentist", city: "Pune", website: "https://smile.example",
  audit: audit({ forms: 0, tel: false }), phone: "+91 20 1111 2222", email: null, address: "1 FC Road, Pune", reviews: 30,
  services: ["Dental implants", "Braces", "Teeth whitening"], competitors: rivals, ...o,
});
const NOW = new Date("2026-10-22T00:00:00Z");

describe("gap-to-growth mapping", () => {
  it("maps each observed gap to an engine with benefit, KPI and priority", () => {
    const g = findGaps(facts(), 2026);
    const form = g.find((x) => x.key === "form")!;
    expect(form).toMatchObject({ layer: "lead_gen", basis: "competitor", kpi: "Visit-to-enquiry rate", demo: "qualify" });
    expect(form.evidence).toMatch(/2 of 2 competitors/);
    expect(form.client_evidence).not.toMatch(/Bright|Pune Dental/);
    const booking = g.find((x) => x.key === "booking")!;
    expect(booking).toMatchObject({ layer: "sales", basis: "competitor" });
    expect(booking.dependencies.join(" ")).toMatch(/booking or calendar/i);
    expect(g.find((x) => x.key === "tracking")).toMatchObject({ layer: "insight", basis: "observed" });
    expect(g.find((x) => x.key === "answers")).toMatchObject({ layer: "experience", basis: "observed", demo: "assistant" });
    expect(g.find((x) => x.key === "reviews")).toMatchObject({ basis: "competitor" });
    // Not observable from outside, so labelled as assumptions.
    expect(g.find((x) => x.key === "follow_up")!.basis).toBe("industry");
    expect(g.find((x) => x.key === "retention")!.confidence).toBe(1);
    // Strongest first; every gap has a priority.
    expect(g[0].score).toBeGreaterThanOrEqual(g.at(-1)!.score);
    expect(g.every((x) => ["high", "medium", "low"].includes(x.priority))).toBe(true);
  });

  it("treats fields older checks didn't record as unknown, not missing", () => {
    const old = audit({ forms: 0 });
    delete old.analytics; delete old.chat;
    const g = findGaps(facts({ audit: old }), 2026);
    expect(g.find((x) => x.key === "tracking")).toMatchObject({ basis: "industry", gap: "Conversion tracking not verified" });
    expect(g.find((x) => x.key === "answers")).toMatchObject({ basis: "industry" });
  });

  it("only recommends what fits the industry", () => {
    const shop = findGaps(facts({ industry: "retail", audit: audit({ booking: false, pricing: false }) }), 2026);
    expect(shop.some((x) => x.key === "booking")).toBe(false);
    expect(shop.some((x) => x.key === "pricing")).toBe(false);
    const trades = findGaps(facts({ industry: "home_services", audit: audit({ booking: false, pricing: false }) }), 2026);
    expect(trades.some((x) => x.key === "booking")).toBe(false);
    expect(trades.find((x) => x.key === "pricing")!.layer).toBe("sales");
  });

  it("starts from a new site when there is no website, and marks unreachable sites unverified", () => {
    const none = buildPlan(facts({ website: null, audit: null }), { now: NOW });
    expect(none.gaps[0].key).toBe("no_site");
    expect(none.rollout[0].items[0]).toBe("Launch the website");
    const down = buildPlan(facts({ audit: { ...audit(), error: "timed out" } }), { now: NOW });
    expect(down.gaps.find((x) => x.key === "unverified")!.client_evidence).toMatch(/unverified/);
    expect(down.unverified[0]).toMatch(/could not be loaded/);
  });

  it("groups gaps into engines, can lead with a chosen engine, and phases the rollout", () => {
    const p = buildPlan(facts(), { now: NOW });
    expect(p.engines.filter((e) => e.primary)).toHaveLength(3);
    expect(p.engines.find((e) => e.key === "experience")!.name).toBe("AI Patient Experience Engine");
    const f = buildPlan(facts(), { now: NOW, focus: "retention" });
    expect(f.engines[0].key).toBe("retention");
    expect(p.rollout.map((r) => r.title)).toEqual(["Phase 1: Foundation and quick wins", "Phase 2: Connect the Growth Engines", "Phase 3: Measure and optimise"]);
    expect(p.capabilities.find((c) => c.name === "AI website concierge")!.status).toBe("simulated");
  });
});

describe("client-facing plan", () => {
  it("leaves out competitor names, evidence and scores", () => {
    const p = buildPlan(facts(), { now: NOW });
    const g = clientGrowth(p, facts());
    const json = JSON.stringify(g);
    expect(json).not.toMatch(/Bright Teeth|Pune Dental Care|evidence|"score"|median/);
    expect(g.differentiation.length + g.strengths.length).toBeGreaterThan(0);
    expect(g.today.find((t) => t.label === "Enquiry form")!.today).toBe("no");
    expect(g.engines[0].points.length).toBeGreaterThan(0);
  });
});

const siteFacts = (o: Partial<SiteFacts> = {}): SiteFacts => ({
  id: "p-smile", name: "Smile Studio", category: "Dentist", city: "Pune", industry: "healthcare", industryLabel: "Healthcare", phone: "+91 20 1111 2222",
  email: null, address: "1 FC Road, Pune", maps_url: null, website: "https://smile.example", audit: audit({ forms: 0, tel: false }), ...o,
});
const input = (o: Partial<ComposeInput> = {}): ComposeInput => ({ facts: siteFacts(), reviews: 30, competitors: rivals, others: ["Bright Teeth Clinic", "Pune Dental Care", "Glow Salon"], mode: "site", now: NOW, ...o });

describe("preview generation", () => {
  it("builds a complete, validated preview and reports each stage", () => {
    const r = compose(input());
    if (!r.ok) throw new Error(r.error);
    expect(r.stages.map((s) => s.key)).toEqual(["gaps", "engines", "blueprint", "content", "validate"]);
    // Without a page inventory the blueprint is partial; everything else completes.
    expect(r.stages.filter((s) => s.status !== "done").map((s) => s.key)).toEqual(["blueprint"]);
    const c = r.content;
    expect(c.growth!.engines.length).toBeGreaterThan(0);
    expect(c.faq!.map((f) => f.q)).toContain("How do I book an appointment?");
    expect(c.assistant!.answers.find((a) => a.keys.includes("hours"))!.a).toMatch(/haven't been confirmed/);
    expect(c.finder!.options.map((o) => o.service)).toEqual(["Dental implants", "Braces", "Teeth whitening"]);
    expect(c.sections).toMatchObject({ assistant: true, finder: true, qualify: true, faq: true });
    expect(JSON.stringify(c)).not.toMatch(/testimonial|award|certified|#1|five-star/i);
  });

  it("keeps two prospects' previews separate", () => {
    const a = compose(input());
    const b = compose(input({ facts: siteFacts({ id: "p-glow", name: "Glow Salon", category: "Beauty salon", industry: "retail", phone: "+91 20 3333", address: "9 MG Road", audit: audit({ nav: ["Haircuts", "Colour"], booking: true }) }), competitors: [], others: ["Smile Studio"] }));
    if (!a.ok || !b.ok) throw new Error("expected both to build");
    expect(JSON.stringify(a.content)).not.toMatch(/Glow Salon|Haircuts|9 MG Road/);
    expect(JSON.stringify(b.content)).not.toMatch(/Smile Studio|Dental implants|FC Road/);
    expect(b.content.growth!.differentiation).toEqual([]);
  });

  it("refuses to save a preview that mentions another business", () => {
    const leaky = siteFacts({ audit: audit({ description: "Better than Bright Teeth Clinic", nav: ["Implants", "Braces"] }) });
    const r = compose(input({ facts: leaky }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.stages.at(-1)).toMatchObject({ key: "validate", status: "failed" });
    // A name that is part of this business's own name is not "another business".
    const ok = compose(input());
    if (!ok.ok) throw new Error(ok.error);
    expect(validateSite(ok.content, ["Smile"])).toEqual([]);
  });

  it("flags trust claims taken from their own site instead of repeating them silently", () => {
    const r = compose(input({ facts: siteFacts({ audit: audit({ description: "Award-winning dental care" }) }) }));
    if (!r.ok) throw new Error(r.error);
    expect(r.stages.find((s) => s.key === "validate")!.status).toBe("partial");
    expect(r.warnings[0]).toMatch(/Award-winning/i);
  });

  it("refreshes only the growth layer in plan mode", () => {
    const first = compose(input());
    if (!first.ok) throw new Error(first.error);
    const edited = { ...first.content, hero: { ...first.content.hero, headline: "Our own headline" } };
    const again = compose(input({ mode: "plan", existing: edited }));
    if (!again.ok) throw new Error(again.error);
    expect(again.content.hero.headline).toBe("Our own headline");
  });
});

describe("refinements", () => {
  const base = () => { const r = compose(input()); if (!r.ok) throw new Error(r.error); return r.content; };
  const opts = { name: "Smile Studio", heroTemplate: "Book your visit to {name} in a minute" };
  it("changes design, emphasis and sections without adding facts", () => {
    expect(refine(base(), "premium", opts)).toMatchObject({ theme: "atelier", layout: "centered" });
    const h = refine(base(), "hero", opts);
    if ("error" in h) throw new Error(h.error);
    expect(h.content.hero.headline).toBe("Book your visit to Smile Studio in a minute");
    const l = refine(base(), "lead_gen", opts);
    if ("error" in l) throw new Error(l.error);
    expect(l.content.growth!.engines[0].key).toBe("lead_gen");
  });
  it("sanitises a segment and can remove it", () => {
    const s = refine(base(), "segment", { ...opts, segment: "  busy <b>parents</b> [[x]] " });
    if ("error" in s) throw new Error(s.error);
    expect(s.content.growth!.segment).toBe("busy bparents/b x");
    expect(s.content.hero.sub).toMatch(/^For busy bparents\/b x: /);
    const off = refine(s.content, "segment", { ...opts, segment: "" });
    if ("error" in off) throw new Error(off.error);
    expect(off.content.hero.sub).not.toMatch(/^For /);
  });
  it("refuses engines with no supporting gap", () => {
    const r = compose(input({ facts: siteFacts({ industry: "retail", audit: audit({ booking: true, pricing: true }) }) }));
    if (!r.ok) throw new Error(r.error);
    expect(refine(r.content, "sales", opts)).toEqual({ error: expect.stringMatching(/No sales-conversion gap/) });
  });
});

describe("website check additions", () => {
  it("detects analytics tags and chat widgets", () => {
    const a = parseAudit({ url: "https://x.in", finalUrl: "https://x.in/", status: 200, ms: 500, bytes: 100,
      html: `<script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script><a href="https://wa.me/9100">WhatsApp</a>` }, 2026);
    expect(a).toMatchObject({ analytics: true, chat: true });
    const b = parseAudit({ url: "https://x.in", finalUrl: "https://x.in/", status: 200, ms: 500, bytes: 100, html: "<p>Hello</p>" }, 2026);
    expect(b).toMatchObject({ analytics: false, chat: false });
  });
});
