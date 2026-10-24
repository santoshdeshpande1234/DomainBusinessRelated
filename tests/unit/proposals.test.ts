import { describe, expect, it } from "vitest";
import { buildProposal, type ProposalInput } from "@/lib/proposals/proposal";
import { computeModel, type Input } from "@/lib/studio/financial";
import { fixtureSite } from "@/lib/studio/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ProposalDocument } from "@/components/proposal-document";

const inp = (o: Record<string, number>, basis: Input["basis"] = "actual") => Object.fromEntries(Object.entries(o).map(([k, value]) => [k, { value, basis }]));
const model = (o: Record<string, number> = {}) => computeModel("lead_gen", inp({
  visits: 1000, lead_rate: 0.02, close_rate: 0.25, revenue_per_customer: 500, gross_margin: 0.6, implementation_cost: 60000, monthly_cost: 3000, ramp_months: 1,
  conservative_traffic: 0, conservative_conversion: 0, base_traffic: 0.1, base_conversion: 0.5, upside_traffic: 0.2, upside_conversion: 1, ...o,
}));
const growth = fixtureSite("dentist")!.content.growth!;
const input = (o: Partial<ProposalInput> = {}): ProposalInput => ({
  business: { name: "Smile Studio", city: "Pune", category: "Dentist", website: "https://smile-studio.example/", contact_name: "Asha Rao", contact_role: "Owner", email: "asha@smile-studio.example" },
  company: { name: "Northlight Digital", website: "https://northlight.example", sender: "Sam Lee" },
  currency: "INR", pricing: { website_build: 80000, website_redesign: 60000, monthly_retainer: 3000 },
  growth, previewUrl: "https://app.example/preview/abc", financial: model(), others: ["Bright Teeth Clinic"], now: new Date("2026-10-24T00:00:00Z"), ...o,
});

describe("proposals", () => {
  it("builds a complete proposal from the saved research and the campaign's prices", () => {
    const { proposal: p, check } = buildProposal(input());
    expect(check.missing).toEqual([]);
    expect(p.title).toBe("Growth proposal for Smile Studio");
    expect(p.prepared_for).toMatchObject({ name: "Smile Studio", contact: "Asha Rao, Owner", website: "smile-studio.example" });
    expect(p.valid_until).toBe("2026-11-23");
    // An existing website is priced as a redesign; the totals add up.
    expect(p.investment.lines.map((l) => [l.label, l.amount, l.recurring])).toEqual([["Website redesign", 60000, "one-time"], ["Growth retainer", 3000, "monthly"]]);
    expect(p.investment).toMatchObject({ one_time: 60000, monthly: 3000, first_year: 96000 });
    expect(p.recommendation.engines.length).toBeGreaterThan(0);
    expect(p.scope.length).toBeGreaterThan(0);
    expect(p.rollout).toEqual(growth.rollout);
    expect(p.preview.url).toBe("https://app.example/preview/abc");
    expect(JSON.stringify(p)).not.toMatch(/Bright Teeth|\[\[/);
  });

  it("shows impact only from a complete financial model, labelled with its confidence", () => {
    const withModel = buildProposal(input()).proposal.impact;
    expect(withModel.available).toBe(true);
    expect(withModel.scenarios.map((s) => s.label)).toEqual(["Conservative", "Base", "Upside"]);
    expect(withModel.note).toMatch(/not a promise/);
    const none = buildProposal(input({ financial: null }));
    expect(none.proposal.impact).toMatchObject({ available: false, scenarios: [] });
    expect(none.check.warnings.join(" ")).toMatch(/No financial model yet/);
    const partial = buildProposal(input({ financial: computeModel("lead_gen", inp({ visits: 1000 })) }));
    expect(partial.proposal.impact.available).toBe(false);
    expect(partial.check.warnings.join(" ")).toMatch(/financial model needs/);
  });

  it("flags a price that doesn't match the financial model, and never estimates a missing price", () => {
    const mismatch = buildProposal(input({ financial: model({ implementation_cost: 50000 }) }));
    expect(mismatch.check.warnings.join(" ")).toMatch(/implementation cost of 50000, but the proposal price is 60000/);
    const unpriced = buildProposal(input({ pricing: { website_redesign: null, monthly_retainer: 3000 } }));
    expect(unpriced.proposal.investment).toMatchObject({ one_time: null, first_year: null });
    expect(unpriced.check.missing).toContain('Price for "Website redesign" (campaign or workspace service pricing).');
    // No website: priced as a new build.
    const fresh = buildProposal(input({ business: { ...input().business, website: null } }));
    expect(fresh.proposal.investment.lines[0]).toMatchObject({ label: "New website", amount: 80000 });
  });

  it("drafts three emails that mention only observed gaps, link the preview when shared, and offer an opt-out", () => {
    const { emails } = buildProposal(input());
    expect(emails.map((e) => [e.key, e.send_after_days])).toEqual([["intro", 0], ["follow_up_1", 3], ["follow_up_2", 7]]);
    expect(emails[0].body).toMatch(/^Hi Asha,/);
    expect(emails[0].body).toContain("https://app.example/preview/abc");
    expect(emails[0].body).toMatch(/reply and I won't follow up/);
    expect(emails[0].body).toMatch(/Sam Lee\nNorthlight Digital\nnorthlight.example$/);
    const industryOnly = growth.gaps.filter((g) => g.basis !== "observed").map((g) => g.gap);
    for (const g of industryOnly) expect(emails[0].body).not.toContain(g);
    const unshared = buildProposal(input({ previewUrl: null, business: { ...input().business, contact_name: null } }));
    expect(unshared.emails[0].body).toMatch(/^Hello Smile Studio team,/);
    expect(JSON.stringify(unshared.emails)).not.toMatch(/preview\/abc/);
    expect(unshared.check.warnings.join(" ")).toMatch(/isn't shared/);
  });

  it("won't be ready without a growth plan, a company name, or with another business named", () => {
    const empty = buildProposal(input({ growth: null }));
    expect(empty.check.missing.join(" ")).toMatch(/Generate the website preview/);
    expect(buildProposal(input({ company: { name: " ", website: null, sender: null } })).check.missing.join(" ")).toMatch(/company name/);
    const named = buildProposal(input({ others: ["Smile"] , business: { ...input().business, name: "Smile Studio" } }));
    expect(named.check.missing.join(" ")).toMatch(/another business \("Smile"\)/);
  });

  it("renders the client document without internal checks", () => {
    const { proposal } = buildProposal(input({ financial: model({ implementation_cost: 50000 }) }));
    const html = renderToStaticMarkup(createElement(ProposalDocument, { p: proposal }));
    expect(html).toContain("Growth proposal for Smile Studio");
    expect(html).toContain("Expected impact");
    expect(html).not.toMatch(/implementation cost of|Bright Teeth/);
  });
});
