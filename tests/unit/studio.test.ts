import { describe, expect, it } from "vitest";
import { computeModel, confidenceOf, STARTER, type Input } from "@/lib/studio/financial";
import { analyse, featureMatrix, type Side } from "@/lib/studio/competitors";
import { buildSite, gaps, jsonLd, pickDesign } from "@/lib/studio/site";
import { parseAudit, type Audit } from "@/lib/discovery/prospects";

const inp = (o: Record<string, number>, basis: Input["basis"] = "actual") => Object.fromEntries(Object.entries(o).map(([k, value]) => [k, { value, basis }]));
const uplifts = { conservative_traffic: 0, conservative_conversion: 0, base_traffic: 0.1, base_conversion: 0.5, upside_traffic: 0.2, upside_conversion: 1 };

describe("financial model", () => {
  const leadGen = { visits: 1000, lead_rate: 0.02, close_rate: 0.25, revenue_per_customer: 500, gross_margin: 0.6, implementation_cost: 1200, monthly_cost: 50, ramp_months: 1, ...uplifts };

  it("asks for missing inputs instead of guessing", () => {
    const r = computeModel("lead_gen", inp({ visits: 1000 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toContain("Visit-to-inquiry rate");
  });

  it("follows the lead-generation formulas", () => {
    const r = computeModel("lead_gen", inp(leadGen));
    if (!r.ok) throw new Error("expected results");
    // 1000 × 2% = 20 inquiries, × 25% = 5 customers, × 500 = 2,500 a month.
    expect(r.current).toMatchObject({ leads: 20, customers: 5, revenue: 2500 });
    const base = r.scenarios[1];
    // 1100 visits × 3% = 33 inquiries → 8.25 customers → 4,125; +1,625 a month.
    expect(base.leads).toBeCloseTo(33);
    expect(base.incremental_revenue_month).toBeCloseTo(1625);
    expect(base.incremental_revenue_year).toBeCloseTo(19500);
    expect(base.incremental_gross_profit_month).toBeCloseTo(975);
    expect(base.incremental_operating_profit_month).toBeCloseTo(925);
    // 12 × 925 − 1,200 = 9,900; spend 1,200 + 600.
    expect(base.first_year_net).toBeCloseTo(9900);
    expect(base.roi).toBeCloseTo(9900 / 1800);
    expect(base.payback_month).toBe(2);
    // No change means no gain, and the costs are a loss that never pays back.
    expect(r.scenarios[0].incremental_revenue_month).toBe(0);
    expect(r.scenarios[0].payback_month).toBeNull();
  });

  it("ramps up, discounts unqualified inquiries and respects capacity", () => {
    const r = computeModel("lead_gen", inp({ ...leadGen, ramp_months: 4, lead_quality: 0.5, capacity: 7 }));
    if (!r.ok) throw new Error("expected results");
    const base = r.scenarios[1];
    // 13 extra inquiries, half qualified: 26.5 × 25% = 6.625 customers (under the cap of 7).
    expect(base.customers).toBeCloseTo(6.625);
    expect(base.capped).toBe(false);
    expect(r.scenarios[2].customers).toBe(7);
    expect(r.scenarios[2].capped).toBe(true);
    expect(r.scenarios[2].spare_capacity).toBe(0);
    // Ramp: months 1–4 at 25/50/75/100%.
    const gp = base.incremental_gross_profit_month;
    expect(base.cumulative[0]).toBeCloseTo(-1200 + gp * 0.25 - 50);
    expect(base.cumulative[3]).toBeCloseTo(-1200 + gp * 2.5 - 200);
    expect(r.notes.join(" ")).toMatch(/50% of additional inquiries/);
  });

  it("handles ecommerce and hours saved", () => {
    const r = computeModel("ecommerce", inp({ sessions: 2000, purchase_rate: 0.01, aov: 40, gross_margin: 0.4, implementation_cost: 500, ...uplifts }));
    if (!r.ok) throw new Error("expected results");
    expect(r.current.revenue).toBe(800);
    expect(r.scenarios[1].revenue).toBeCloseTo(2200 * 0.015 * 40);
    const h = computeModel("lead_gen", inp({ ...leadGen, minutes_per_inquiry: 20, automation_share: 0.5 }));
    if (!h.ok) throw new Error("expected results");
    expect(h.scenarios[1].hours_saved_month).toBeCloseTo((33 * 20 * 0.5) / 60);
  });

  it("scores confidence by how inputs were sourced", () => {
    expect(confidenceOf("lead_gen", inp(leadGen))).toBe(100);
    const mixed = { ...inp(leadGen), ...inp(Object.fromEntries(Object.keys(STARTER).map((k) => [k, STARTER[k]])), "assumption") };
    expect(confidenceOf("lead_gen", mixed)).toBeLessThan(80);
  });
});

const audit = (o: Partial<Audit>): Audit => ({
  url: "", final_url: "https://x.com/", status: 200, https: true, ms: 800, kb: 50, title: "x", description: "d", viewport: true, h1: 1,
  forms: 1, booking: false, cta: ["contact us"], tel: true, emails: [], schema: false, copyright_year: 2025, generator: null, pricing: false, ...o,
});

describe("competitor analysis", () => {
  const me: Side = { name: "Acme", audit: audit({ forms: 0, tel: false, schema: true }), reviews: 10, rating: 4.5, hasWebsite: true };
  const others: Side[] = [
    { name: "B", audit: audit({ booking: false }), reviews: 40, rating: null, hasWebsite: true },
    { name: "C", audit: audit({}), reviews: 80, rating: null, hasWebsite: true },
    { name: "D", audit: { ...audit({}), error: "timed out" }, reviews: null, rating: null, hasWebsite: true },
  ];
  it("compares only checked websites", () => {
    const m = featureMatrix(me, others);
    const form = m.find((r) => r.key === "form")!;
    expect(form).toMatchObject({ prospect: false, competitors: [true, true, null], share: 1 });
  });
  it("separates facts from assumptions and ranks recommendations", () => {
    const a = analyse(me, others);
    expect(a.compared).toBe(2);
    expect(a.advantages.map((x) => x.text)).toEqual(expect.arrayContaining([expect.stringMatching(/^Inquiry form on the home page: 2 of 2/), expect.stringMatching(/median is 60/)]));
    expect(a.strengths[0].text).toMatch(/Structured data/);
    expect(a.unserved.some((x) => x.kind === "assumption" && /outside office hours/.test(x.text))).toBe(true);
    expect(a.recommendations[0].text).toBe("Add an inquiry form to the home page");
    expect(a.recommendations.at(-1)!.text).toBe("Ask happy customers for reviews");
  });
  it("treats no website as a gap", () => {
    const a = analyse({ ...me, audit: null, hasWebsite: false }, others);
    expect(a.recommendations[0].text).toBe("Launch a website");
  });
});

describe("website preview content", () => {
  const facts = { id: "p1", name: "Smile Dental", category: "Dentist", city: "Pune", industry: "healthcare", industryLabel: "Healthcare", phone: "020 1234", email: null, address: "1 Main Rd", maps_url: null, website: null, audit: null };
  it("uses only known facts and marks the rest as placeholders", () => {
    const c = buildSite(facts);
    expect(c.hero.headline).toBe("Dentist in Pune");
    expect(c.hero.primary_cta).toBe("Book an appointment");
    expect(gaps(c)).toEqual(["services 1 › title: Service 1", "services 2 › title: Service 2", "services 3 › title: Service 3", "about: A few sentences about the business, in its own words"]);
    expect(JSON.stringify(c)).not.toMatch(/award|testimonial|best|#1|rated/i);
    expect(jsonLd(c, null)).toMatchObject({ name: "Smile Dental", telephone: "020 1234", description: undefined });
  });
  it("takes services from the business's own navigation", () => {
    const a = parseAudit({ url: "https://x.in", finalUrl: "https://x.in/", status: 200, ms: 500, bytes: 100,
      html: `<nav><a href="/">Home</a><a href="/i">Dental implants</a><a>Root canal</a><a>Contact Us</a></nav><h2>Our care</h2><p>Price ₹ 500</p>` }, 2026);
    expect(a.nav).toEqual(["Dental implants", "Root canal"]);
    expect(a.headings).toEqual(["Our care"]);
    expect(a.pricing).toBe(true);
    const c = buildSite({ ...facts, audit: { ...a, description: "Family dentist since 2001" } });
    expect(c.services.map((s) => s.title)).toEqual(["Dental implants", "Root canal"]);
    expect(gaps(c)).toEqual([]);
  });
  it("picks a stable design per business", () => {
    expect(pickDesign(facts)).toEqual(pickDesign(facts));
    expect(["harbor", "sage"]).toContain(pickDesign(facts).theme);
  });
  it("does not flag opening hours as prices", () => {
    const a = parseAudit({ url: "https://x.in", finalUrl: "https://x.in/", status: 200, ms: 500, bytes: 100, html: "<p>Open hours 9 to 5</p>" }, 2026);
    expect(a.pricing).toBe(false);
  });
});
