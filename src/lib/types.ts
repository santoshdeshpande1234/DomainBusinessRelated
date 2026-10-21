export type Pricing = { website_build?: number; website_redesign?: number; monthly_retainer?: number };

export type Campaign = {
  id: string; workspace_id: string; name: string; industry: string; custom_industry: string | null;
  country: string; region: string | null; city: string | null; service_area: string | null;
  language: string; currency: string; objectives: string[]; domain_budget: number; prospect_budget: number;
  max_prospects: number; min_quality_score: number; extensions: string[]; service_pricing: Pricing;
  limits: { max_domains?: number; daily_email_limit?: number; max_api_spend_usd?: number };
  notes: string | null; status: "draft" | "active" | "paused" | "archived";
  fx: { currency: string; usd_per_unit: number; fetched_at: string; provider: string };
  progress: Record<string, unknown>; created_by: string | null; created_at: string; updated_at: string;
};
