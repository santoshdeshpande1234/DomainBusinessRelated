export const INDUSTRIES = [
  ["healthcare", "Healthcare"], ["professional_services", "Professional services"], ["real_estate", "Real estate"],
  ["hospitality", "Hospitality"], ["education", "Education"], ["automotive", "Automotive"], ["home_services", "Home services"],
  ["manufacturing", "Manufacturing"], ["it", "IT"], ["retail", "Retail"], ["custom", "Custom industry"],
] as const;

export const OBJECTIVES = [
  ["domain_investment", "Domain investment", "Acquire undervalued domains to hold"],
  ["domain_sales", "Domain sales", "Sell domains to matching businesses"],
  ["website_development", "Website development", "Build new sites for prospects"],
  ["website_redesign", "Website redesign", "Rebuild underperforming sites"],
  ["lead_generation", "Lead generation", "Generate inquiries for prospects"],
  ["combined_growth", "Combined growth services", "Domain, website and leads together"],
] as const;

export const CURRENCIES = ["USD", "INR", "GBP", "EUR", "CAD", "AUD", "AED", "SGD", "SAR", "JPY", "CHF", "NZD", "ZAR", "MXN", "BRL", "HKD", "SEK", "NOK", "DKK", "QAR"] as const;

export const LANGUAGES = ["English", "Hindi", "Spanish", "French", "German", "Arabic", "Portuguese", "Italian", "Dutch", "Japanese", "Mandarin Chinese", "Tamil", "Bengali"] as const;

export const COUNTRIES = ["United States", "India", "United Kingdom", "Canada", "Australia", "United Arab Emirates", "Singapore", "Saudi Arabia",
  "Germany", "France", "Spain", "Italy", "Netherlands", "Ireland", "New Zealand", "South Africa", "Japan", "Switzerland", "Sweden",
  "Norway", "Denmark", "Qatar", "Mexico", "Brazil", "Hong Kong"] as const;

export const EXTENSIONS = [".com", ".net", ".org", ".co", ".io", ".ai", ".in", ".co.uk", ".ca", ".com.au", ".ae", ".sg", ".de", ".app", ".biz"] as const;

export const ROLES = ["admin", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export type Provider = {
  key: string; name: string; category: string; phase: number; description: string;
  fields: { name: string; label: string; secret: boolean }[]; docs: string;
};

// Credentials are only stored in Phase 1; each adapter is wired up in the phase that uses it.
export const PROVIDERS: Provider[] = [
  { key: "godaddy", name: "GoDaddy", category: "Domains", phase: 2, description: "Domain availability and registration prices.", docs: "https://developer.godaddy.com/keys",
    fields: [{ name: "api_key", label: "API key", secret: true }, { name: "api_secret", label: "API secret", secret: true }] },
  { key: "namecheap", name: "Namecheap", category: "Domains", phase: 2, description: "Domain availability and pricing (requires a whitelisted IP).", docs: "https://www.namecheap.com/support/api/intro/",
    fields: [{ name: "api_user", label: "API user", secret: false }, { name: "api_key", label: "API key", secret: true }, { name: "client_ip", label: "Whitelisted IP", secret: false }] },
  { key: "google_places", name: "Google Places", category: "Prospects", phase: 2, description: "Business listings, addresses and websites by location.", docs: "https://developers.google.com/maps/documentation/places/web-service/get-api-key",
    fields: [{ name: "api_key", label: "API key", secret: true }] },
  { key: "serpapi", name: "SerpApi", category: "Research", phase: 2, description: "Search results for competitor and keyword research.", docs: "https://serpapi.com/manage-api-key",
    fields: [{ name: "api_key", label: "API key", secret: true }] },
  { key: "pagespeed", name: "Google PageSpeed", category: "Research", phase: 2, description: "Mobile performance audits of prospect websites.", docs: "https://developers.google.com/speed/docs/insights/v5/get-started",
    fields: [{ name: "api_key", label: "API key", secret: true }] },
  { key: "hunter", name: "Hunter", category: "Contacts", phase: 2, description: "Verified business email addresses (licensed data).", docs: "https://hunter.io/api-keys",
    fields: [{ name: "api_key", label: "API key", secret: true }] },
  { key: "openai", name: "OpenAI", category: "AI", phase: 3, description: "Research summaries, website copy and proposal writing.", docs: "https://platform.openai.com/api-keys",
    fields: [{ name: "api_key", label: "API key", secret: true }, { name: "model", label: "Model", secret: false }] },
  { key: "resend", name: "Resend", category: "Email", phase: 5, description: "Sending approved campaign emails from a verified domain.", docs: "https://resend.com/api-keys",
    fields: [{ name: "api_key", label: "API key", secret: true }, { name: "from_email", label: "Verified sender address", secret: false }] },
];

// Modules up to this phase are built; later ones show as "coming next".
export const LIVE_PHASE = 2;

export const MODULES = [
  { key: "domains", label: "Domain discovery", phase: 2, text: "Score candidate domains with registry availability, pricing and evidence. Nothing is ever bought automatically." },
  { key: "prospects", label: "Prospect research", phase: 2, text: "Find real businesses, audit their websites and keep every fact with its source." },
  { key: "studio", label: "Website studio", phase: 3, text: "Tailored website previews on private staging links, with no invented claims." },
  { key: "financials", label: "Financial opportunity", phase: 3, text: "Code-based scenarios for revenue, profit, ROI and payback with visible assumptions." },
  { key: "proposals", label: "Proposals & PDF", phase: 4, text: "One consulting-quality template filled with each prospect's research." },
  { key: "outreach", label: "Email approval", phase: 5, text: "Personalised drafts you approve, with opt-outs, limits and tracking." },
] as const;

export function labelOf(list: readonly (readonly string[])[], key: string) {
  return list.find((x) => x[0] === key)?.[1] ?? key;
}
