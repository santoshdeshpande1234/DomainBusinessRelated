import { z } from "zod";
import { CURRENCIES, INDUSTRIES, LANGUAGES, OBJECTIVES, ROLES } from "@/lib/options";

const money = (max: number) => z.coerce.number().min(0, "Must be 0 or more").max(max);
const optionalMoney = (max: number) => z.preprocess((v) => (v === "" || v == null ? undefined : v), money(max).optional());
const optionalInt = (min: number, max: number) => z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(min).max(max).optional());
const optionalText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());

export const pricingSchema = z.object({
  website_build: optionalMoney(10_000_000),
  website_redesign: optionalMoney(10_000_000),
  monthly_retainer: optionalMoney(10_000_000),
});

export const campaignSchema = z.object({
  name: z.string().trim().min(3, "At least 3 characters").max(120),
  industry: z.enum(INDUSTRIES.map((i) => i[0]) as [string, ...string[]]),
  custom_industry: optionalText(80),
  country: z.string().trim().min(2).max(80),
  region: optionalText(80),
  city: optionalText(80),
  service_area: optionalText(200),
  language: z.enum(LANGUAGES),
  currency: z.enum(CURRENCIES),
  objectives: z.array(z.enum(OBJECTIVES.map((o) => o[0]) as [string, ...string[]])).min(1, "Choose at least one objective"),
  domain_budget: money(100_000_000),
  prospect_budget: money(100_000_000),
  max_prospects: z.coerce.number().int().min(1).max(1000),
  min_quality_score: z.coerce.number().int().min(0).max(100),
  extensions: z.array(z.string()).min(1, "Choose at least one extension").max(20).transform((list, ctx) => {
    const out: string[] = [];
    for (const raw of list) {
      const e = raw.trim().toLowerCase().replace(/^(?!\.)/, ".");
      if (!/^(\.[a-z0-9-]{2,24}){1,2}$/.test(e)) {
        ctx.addIssue({ code: "custom", message: `Invalid extension: ${raw}` });
        return z.NEVER;
      }
      if (!out.includes(e)) out.push(e);
    }
    return out;
  }),
  service_pricing: pricingSchema.default({}),
  limits: z.object({
    max_domains: optionalInt(1, 1000),
    daily_email_limit: optionalInt(1, 2000),
    max_api_spend_usd: optionalMoney(1_000_000),
  }).default({}),
  notes: optionalText(2000),
}).superRefine((c, ctx) => {
  if (c.industry === "custom" && !c.custom_industry) ctx.addIssue({ code: "custom", path: ["custom_industry"], message: "Describe the custom industry" });
});
export type CampaignInput = z.infer<typeof campaignSchema>;

export const workspaceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  default_currency: z.enum(CURRENCIES),
  default_language: z.enum(LANGUAGES),
  company_name: z.string().trim().max(120).default(""),
  company_website: z.string().trim().max(200).default("").refine((v) => v === "" || /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v), "Use a full URL starting with https://"),
  sender_name: z.string().trim().max(80).default(""),
  monthly_api_budget_usd: optionalMoney(1_000_000),
  service_pricing: pricingSchema.default({}),
});

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(ROLES),
});

export const statusSchema = z.enum(["draft", "active", "paused", "archived"]);

/** First error per field, for showing next to inputs. */
export function fieldErrors(err: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = i.path.join(".") || "_";
    out[k] ??= i.message;
  }
  return out;
}
