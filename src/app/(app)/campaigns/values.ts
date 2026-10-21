import type { Campaign, Pricing } from "@/lib/types";
import type { WizardValues } from "./wizard";

const str = (n: number | null | undefined) => (n == null ? "" : String(n));

export function toWizard(c: Campaign | null, ws: { default_currency: string; default_language: string; service_pricing: Pricing }): WizardValues {
  const p = c?.service_pricing ?? ws.service_pricing ?? {};
  return {
    name: c?.name ?? "", industry: c?.industry ?? "healthcare", custom_industry: c?.custom_industry ?? "", notes: c?.notes ?? "",
    country: c?.country ?? "", region: c?.region ?? "", city: c?.city ?? "", service_area: c?.service_area ?? "",
    language: c?.language ?? ws.default_language, currency: c?.currency ?? ws.default_currency,
    objectives: c?.objectives ?? [],
    domain_budget: str(c?.domain_budget ?? 0), prospect_budget: str(c?.prospect_budget ?? 0),
    max_prospects: str(c?.max_prospects ?? 50), min_quality_score: str(c?.min_quality_score ?? 60),
    extensions: c?.extensions ?? [".com"],
    limits: { max_domains: str(c?.limits?.max_domains), daily_email_limit: str(c?.limits?.daily_email_limit), max_api_spend_usd: str(c?.limits?.max_api_spend_usd) },
    service_pricing: { website_build: str(p.website_build), website_redesign: str(p.website_redesign), monthly_retainer: str(p.monthly_retainer) },
  };
}
