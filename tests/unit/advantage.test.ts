import { describe, expect, it } from "vitest";
import { assessAdvantage, differentiators, type AdvantageFacts } from "@/lib/studio/advantage";
import { buildPlan, clientGrowth, type GrowthFacts } from "@/lib/studio/growth";
import type { Audit } from "@/lib/discovery/prospects";
import type { Side } from "@/lib/studio/competitors";
import { compose } from "@/lib/studio/compose";

const audit = (o: Partial<Audit> = {}): Audit => ({
  url: "", final_url: "https://smile.example/", status: 200, https: true, ms: 800, kb: 50, title: "x", description: "Family dentist", viewport: true, h1: 1,
  forms: 1, booking: false, cta: ["contact us"], tel: true, emails: [], schema: false, copyright_year: 2025, generator: null, pricing: false,
  nav: ["Dental implants", "Braces", "Teeth whitening"], headings: [], analytics: true, chat: false, ...o,
});
const rival = (name: string, o: Partial<Audit> = {}, reviews = 120, rating = 4.7): Side => ({ name, audit: audit(o), reviews, rating, hasWebsite: true });
const rivals = [rival("Bright Teeth Clinic", { booking: true }), rival("Pune Dental Care", { booking: true }, 90, 4.6), rival("Smile Line", { booking: true, schema: true }, 140, 4.8)];
const me = (o: Partial<Audit> = {}, reviews: number | null = 30, rating: number | null = 4.2): Side => ({ name: "Smile Studio", audit: audit(o), reviews, rating, hasWebsite: true });
const input = (o: Partial<AdvantageFacts> = {}): AdvantageFacts => ({ name: "Smile Studio", industry: "healthcare", prospect: me(), competitors: rivals, ...o });

describe("competitive position", () => {
  it("says where the business is behind, ahead or on open ground, from counts", () => {
    const a = assessAdvantage(input({ prospect: me({ https: false }) }));
    const dim = (k: string) => a.dimensions.find((d) => d.key === k)!;
    expect(dim("reputation")).toMatchObject({ position: "behind", confidence: 3 });
    expect(dim("reputation").signals[0].evidence).toBe("Smile Studio has 30 public reviews; typical among 3 nearby businesses compared: 120.");
    expect(dim("convenience").signals.find((s) => s.key === "booking")).toMatchObject({ position: "behind", evidence: expect.stringMatching(/3 of 3 nearby businesses/) });
    expect(dim("responsiveness").signals.find((s) => s.key === "answers")!.position).toBe("open");
    expect(a.losing).toContain("reputation");
    expect(a.headline).toMatch(/^Smile Studio is losing ground on reputation and trust/);
    expect(a.evidence.strength).toBe("strong");
    // Never names a competitor, so it can be shown to the client.
    expect(JSON.stringify(a)).not.toMatch(/Bright Teeth|Pune Dental|Smile Line/);
  });

  it("weights website defects lowest: a competitive gap outranks a defect", () => {
    const a = assessAdvantage(input({ prospect: me({ https: false, viewport: false }) }));
    expect(a.dimensions.find((d) => d.key === "digital")!.weight).toBe(1);
    expect(a.dimensions.at(-1)!.weight).toBe(1);
    const edge = differentiators(a);
    expect(edge.get("booking")).toBeGreaterThan(edge.get("https")!);
    // In the growth plan the booking gap now ranks ahead of the HTTPS defect.
    const f: GrowthFacts = { name: "Smile Studio", industry: "healthcare", industryLabel: "Healthcare", category: "Dentist", city: "Pune", website: "https://smile.example",
      audit: audit({ https: false }), phone: null, email: null, address: null, reviews: 30, rating: 4.2, services: [], competitors: rivals };
    const plan = buildPlan(f, { now: new Date("2026-10-22T00:00:00Z") });
    const idx = (k: string) => plan.gaps.findIndex((g) => g.key === k);
    expect(idx("booking")).toBeLessThan(idx("https"));
    expect(plan.gaps.find((g) => g.key === "booking")!.edge).toMatch(/Ease of buying: behind/);
    expect(plan.summary.problem).toMatch(/^Smile Studio is losing ground on/);
  });

  it("recommends capabilities with implementations ranked by evidence", () => {
    const a = assessAdvantage(input());
    expect(a.capabilities[0].key).toMatch(/reputation|convenience/);
    const booking = a.capabilities.flatMap((c) => c.implementations).find((i) => i.key === "booking")!;
    expect(booking).toMatchObject({ likelihood: "high", engine: "sales" });
    const chat = a.capabilities.flatMap((c) => c.implementations).find((i) => i.key === "answers")!;
    expect(chat.likelihood).toBe("medium");
    expect(chat.why).toMatch(/untested locally/);
  });

  it("is ahead where it has what most nearby businesses lack", () => {
    const a = assessAdvantage(input({ prospect: me({ booking: true, chat: true, schema: true, pricing: true }, 300, 4.9) }));
    expect(a.defend).toEqual(expect.arrayContaining(["reputation", "responsiveness"]));
    expect(a.losing).toEqual([]);
  });

  it("is honest when nothing was compared", () => {
    const a = assessAdvantage(input({ competitors: [] }));
    expect(a.compared).toBe(0);
    expect(a.dimensions.every((d) => d.position === "unknown")).toBe(true);
    expect(a.evidence.strength).toBe("weak");
    expect(a.evidence.improve.join(" ")).toMatch(/Compare at least 3/);
    expect(a.headline).toMatch(/couldn't be compared/);
  });

  it("reads inner-page prices into the comparison", () => {
    const a = assessAdvantage(input({ site: { servicePages: 6, prices: true } }));
    const offer = a.dimensions.find((d) => d.key === "offer")!;
    expect(offer.signals.find((s) => s.key === "pricing")).toMatchObject({ position: "level", source: "page-by-page read" });
    expect(offer.signals.find((s) => s.key === "services")!.evidence).toMatch(/has 6 services presented/);
  });

  it("gives a five-year outlook labelled by horizon and readiness, with no numbers", () => {
    const a = assessAdvantage(input());
    expect(a.outlook.length).toBeGreaterThanOrEqual(4);
    expect(a.outlook[0]).toMatchObject({ dimension: "convenience", readiness: "not yet" });
    expect(a.outlook.some((o) => o.horizon === "next 3–5 years")).toBe(true);
    expect(a.outlook.map((o) => `${o.trend} ${o.implication}`).join(" ")).not.toMatch(/\d/);
  });

  it("reaches the client plan in counts only", () => {
    const f: GrowthFacts = { name: "Smile Studio", industry: "healthcare", industryLabel: "Healthcare", category: "Dentist", city: "Pune", website: "https://smile.example",
      audit: audit(), phone: null, email: null, address: null, reviews: 30, rating: 4.2, services: [], competitors: rivals };
    const g = clientGrowth(buildPlan(f), f);
    expect(g.position!.headline).toMatch(/losing ground/);
    expect(g.position!.dimensions.length).toBeGreaterThan(0);
    expect(JSON.stringify(g.position)).not.toMatch(/Bright Teeth|Pune Dental|Smile Line|"score"|confidence|weight/);
    // The comparison passes the preview's trust-claim and other-business checks.
    const r = compose({ facts: { id: "p1", name: "Smile Studio", category: "Dentist", city: "Pune", industry: "healthcare", industryLabel: "Healthcare", phone: null, email: null, address: null, maps_url: null,
      website: "https://smile.example", audit: audit({ forms: 0 }) }, reviews: 30, rating: 4.2, competitors: rivals, others: rivals.map((x) => x.name), mode: "site" });
    if (!r.ok) throw new Error(r.error);
    expect(r.stages.find((s) => s.key === "validate")).toMatchObject({ status: "done" });
    expect(r.content.growth!.position!.dimensions.find((d) => d.name === "Reputation and trust")!.points.join(" ")).toMatch(/average public rating: 4.2/);
    const none = clientGrowth(buildPlan({ ...f, competitors: [] }), f);
    expect(none.position!.headline).toBeNull();
    expect(none.position!.dimensions).toEqual([]);
  });
});
