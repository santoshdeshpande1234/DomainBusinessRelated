import { describe, expect, it } from "vitest";
import { campaignSchema, inviteSchema, workspaceSchema } from "@/lib/validation";

const base = {
  name: "Austin dental", industry: "healthcare", country: "United States", city: "Austin", language: "English", currency: "USD",
  objectives: ["website_redesign"], domain_budget: "500", prospect_budget: "200", max_prospects: "50", min_quality_score: "60",
  extensions: [".com"], service_pricing: { website_build: "", website_redesign: "3000", monthly_retainer: "" },
  limits: { max_domains: "", daily_email_limit: "40", max_api_spend_usd: "" }, notes: "",
};

describe("campaignSchema", () => {
  it("coerces numbers and drops blank optionals", () => {
    const r = campaignSchema.parse(base);
    expect(r.domain_budget).toBe(500);
    expect(r.service_pricing).toEqual({ website_redesign: 3000 });
    expect(r.limits).toEqual({ daily_email_limit: 40 });
    expect(r.notes).toBeUndefined();
  });
  it("requires a description for a custom industry", () => {
    const r = campaignSchema.safeParse({ ...base, industry: "custom", custom_industry: " " });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].path).toEqual(["custom_industry"]);
  });
  it("normalises, dedupes and validates extensions", () => {
    expect(campaignSchema.parse({ ...base, extensions: ["COM", ".com", "co.uk"] }).extensions).toEqual([".com", ".co.uk"]);
    expect(campaignSchema.safeParse({ ...base, extensions: ["bad ext"] }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...base, extensions: [] }).success).toBe(false);
  });
  it("rejects out-of-range values", () => {
    for (const patch of [{ domain_budget: "-1" }, { max_prospects: "0" }, { max_prospects: "1001" }, { min_quality_score: "101" }, { objectives: [] }, { currency: "XYZ" }, { name: "ab" }])
      expect(campaignSchema.safeParse({ ...base, ...patch }).success, JSON.stringify(patch)).toBe(false);
  });
});

describe("workspace and invite schemas", () => {
  it("accepts an empty website but rejects a bare domain", () => {
    const ws = { name: "Acme", default_currency: "INR", default_language: "Hindi", company_website: "" };
    expect(workspaceSchema.safeParse(ws).success).toBe(true);
    expect(workspaceSchema.safeParse({ ...ws, company_website: "acme.com" }).success).toBe(false);
  });
  it("lowercases invite emails", () => {
    expect(inviteSchema.parse({ email: " Ana@Example.COM ", role: "viewer" }).email).toBe("ana@example.com");
    expect(inviteSchema.safeParse({ email: "x@y.z", role: "owner" }).success).toBe(false);
  });
});
