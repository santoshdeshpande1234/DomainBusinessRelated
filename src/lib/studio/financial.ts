// Financial opportunity model. Pure, deterministic arithmetic: no AI, no hidden constants.
// Every input carries how it was obtained, and results are estimates built only from those inputs.

export type Basis = "actual" | "benchmark" | "assumption";
export type Input = { value: number | null; basis: Basis; source_url?: string | null; note?: string | null };
export type ModelKind = "lead_gen" | "ecommerce";

type Field = { key: string; label: string; unit: "count" | "pct" | "money" | "months" | "minutes"; required: boolean; help: string; kinds: ModelKind[] };

export const FIELDS: Field[] = [
  { key: "visits", label: "Relevant monthly website visits", unit: "count", required: true, kinds: ["lead_gen"], help: "Visits from people who could become customers (from their analytics, or an estimate)." },
  { key: "lead_rate", label: "Visit-to-inquiry rate", unit: "pct", required: true, kinds: ["lead_gen"], help: "Share of visits that call, book or send an inquiry." },
  { key: "close_rate", label: "Inquiry-to-customer rate", unit: "pct", required: true, kinds: ["lead_gen"], help: "Share of inquiries that become paying customers." },
  { key: "revenue_per_customer", label: "Average revenue per customer", unit: "money", required: true, kinds: ["lead_gen"], help: "Revenue from one new customer in the period you care about." },
  { key: "sessions", label: "Monthly store sessions", unit: "count", required: true, kinds: ["ecommerce"], help: "Online store sessions per month." },
  { key: "purchase_rate", label: "Purchase conversion rate", unit: "pct", required: true, kinds: ["ecommerce"], help: "Share of sessions that end in an order." },
  { key: "aov", label: "Average order value", unit: "money", required: true, kinds: ["ecommerce"], help: "Average revenue per order." },
  { key: "gross_margin", label: "Gross margin", unit: "pct", required: true, kinds: ["lead_gen", "ecommerce"], help: "Revenue left after the direct cost of delivering the work or goods." },
  { key: "lead_quality", label: "Share of new inquiries that are qualified", unit: "pct", required: false, kinds: ["lead_gen"], help: "Extra inquiries are not all good fits. Blank counts them all." },
  { key: "capacity", label: "Most new customers they can serve a month", unit: "count", required: false, kinds: ["lead_gen", "ecommerce"], help: "Staff or stock limit. Blank means no limit." },
  { key: "minutes_per_inquiry", label: "Staff minutes per inquiry today", unit: "minutes", required: false, kinds: ["lead_gen"], help: "Phone, back-and-forth and scheduling time per inquiry." },
  { key: "automation_share", label: "Share of that time the new site removes", unit: "pct", required: false, kinds: ["lead_gen"], help: "For example, self-service booking and structured forms." },
  { key: "seasonality", label: "Seasonal swing (±)", unit: "pct", required: false, kinds: ["lead_gen", "ecommerce"], help: "How far a typical month can sit above or below average." },
  { key: "ramp_months", label: "Months to reach full effect", unit: "months", required: false, kinds: ["lead_gen", "ecommerce"], help: "Results build up linearly over this period. Blank means 3." },
  { key: "implementation_cost", label: "Implementation cost (one-time)", unit: "money", required: true, kinds: ["lead_gen", "ecommerce"], help: "Your price for the build or redesign." },
  { key: "monthly_cost", label: "Recurring cost per month", unit: "money", required: false, kinds: ["lead_gen", "ecommerce"], help: "Hosting, retainer or tools the business would pay." },
];

export const SCENARIOS = [
  { key: "conservative", label: "Conservative" },
  { key: "base", label: "Base" },
  { key: "upside", label: "Upside" },
] as const;
export type ScenarioKey = (typeof SCENARIOS)[number]["key"];

/** Uplift inputs per scenario, as relative changes (0.25 = +25%) to traffic and conversion. */
export const UPLIFT_FIELDS = SCENARIOS.flatMap((s) => [
  { key: `${s.key}_traffic`, scenario: s.key, label: `${s.label}: traffic change`, unit: "pct" as const },
  { key: `${s.key}_conversion`, scenario: s.key, label: `${s.label}: conversion change`, unit: "pct" as const },
]);

/**
 * Starter assumptions so a model can be explored before real figures arrive. They are labelled as
 * assumptions everywhere, lower the confidence, and are meant to be replaced.
 */
export const STARTER: Record<string, number> = {
  conservative_traffic: 0, conservative_conversion: 0.1, base_traffic: 0.1, base_conversion: 0.25, upside_traffic: 0.2, upside_conversion: 0.5,
  lead_quality: 0.7, ramp_months: 3, seasonality: 0.15, automation_share: 0.3,
};

const pick = (inputs: Record<string, Input>, k: string) => {
  const v = inputs[k]?.value;
  return v == null || !Number.isFinite(v) ? null : v;
};

export type Period = { visits: number; leads: number; customers: number; revenue: number; capped: boolean };
export type ScenarioResult = Period & {
  key: ScenarioKey; label: string; qualified_new_leads: number;
  incremental_revenue_month: number; incremental_revenue_year: number;
  incremental_gross_profit_month: number; incremental_operating_profit_month: number;
  first_year_revenue: number; first_year_net: number; roi: number | null; payback_month: number | null;
  hours_saved_month: number | null; spare_capacity: number | null; low_month: number; high_month: number;
  cumulative: number[];
};
export type Results = {
  ok: true; model: ModelKind; current: Period; scenarios: ScenarioResult[]; confidence: number;
  costs: { implementation: number; monthly: number; first_year: number }; ramp_months: number; notes: string[];
} | { ok: false; missing: string[] };

const BASIS_WEIGHT: Record<Basis, number> = { actual: 100, benchmark: 70, assumption: 30 };

/** Confidence: how well-sourced the inputs that drive the result are (required inputs count double). */
export function confidenceOf(model: ModelKind, inputs: Record<string, Input>) {
  const used = FIELDS.filter((f) => f.kinds.includes(model) && pick(inputs, f.key) != null);
  const ups = UPLIFT_FIELDS.filter((f) => pick(inputs, f.key) != null);
  let w = 0, s = 0;
  for (const f of used) { const k = f.required ? 2 : 1; w += k; s += k * BASIS_WEIGHT[inputs[f.key].basis]; }
  for (const f of ups) { w += 1; s += BASIS_WEIGHT[inputs[f.key].basis]; }
  return w ? Math.round(s / w) : 0;
}

function period(model: ModelKind, traffic: number, rate: number, close: number, value: number, capacity: number | null): Period {
  const leads = traffic * rate;
  const raw = model === "ecommerce" ? leads : leads * close;
  const customers = capacity != null ? Math.min(raw, capacity) : raw;
  return { visits: traffic, leads, customers, revenue: customers * value, capped: capacity != null && raw > capacity };
}

export function computeModel(model: ModelKind, inputs: Record<string, Input>): Results {
  const required = FIELDS.filter((f) => f.kinds.includes(model) && f.required);
  const missing = [...required.filter((f) => pick(inputs, f.key) == null).map((f) => f.label),
    ...UPLIFT_FIELDS.filter((f) => pick(inputs, f.key) == null).map((f) => f.label)];
  if (missing.length) return { ok: false, missing };

  const g = (k: string) => pick(inputs, k);
  const traffic = model === "ecommerce" ? g("sessions")! : g("visits")!;
  const rate = model === "ecommerce" ? g("purchase_rate")! : g("lead_rate")!;
  const close = model === "ecommerce" ? 1 : g("close_rate")!;
  const value = model === "ecommerce" ? g("aov")! : g("revenue_per_customer")!;
  const margin = g("gross_margin")!;
  const quality = model === "ecommerce" ? 1 : g("lead_quality") ?? 1;
  const capacity = g("capacity");
  const ramp = Math.max(1, Math.round(g("ramp_months") ?? 3));
  const swing = g("seasonality") ?? 0;
  const impl = g("implementation_cost")!;
  const monthly = g("monthly_cost") ?? 0;
  const notes: string[] = [];

  const current = period(model, traffic, rate, close, value, capacity);
  if (current.capped) notes.push("Current demand already exceeds the stated capacity, so extra demand cannot become extra customers until capacity grows.");

  const scenarios = SCENARIOS.map(({ key, label }): ScenarioResult => {
    const t = traffic * (1 + g(`${key}_traffic`)!);
    const r = Math.min(1, rate * (1 + g(`${key}_conversion`)!));
    const grossLeads = t * r;
    // Only the qualified share of the extra inquiries is assumed to convert at the usual rate.
    const extra = Math.max(0, grossLeads - current.leads);
    const qualifiedLeads = current.leads + extra * quality;
    const rawCustomers = model === "ecommerce" ? qualifiedLeads : qualifiedLeads * close;
    const customers = capacity != null ? Math.min(rawCustomers, capacity) : rawCustomers;
    const revenue = customers * value;
    const incRev = revenue - current.revenue;
    const incGp = incRev * margin;
    const months = Array.from({ length: 36 }, (_, i) => Math.min(1, (i + 1) / ramp));
    let cum = -impl;
    const cumulative = months.map((f) => (cum += incGp * f - monthly));
    const firstYear = months.slice(0, 12).reduce((s, f) => s + incRev * f, 0);
    const firstYearNet = cumulative[11];
    const spend = impl + monthly * 12;
    const payback = cumulative.findIndex((v) => v >= 0);
    const minutes = g("minutes_per_inquiry"), share = g("automation_share");
    return {
      key, label, visits: t, leads: grossLeads, customers, revenue, capped: capacity != null && rawCustomers > capacity,
      qualified_new_leads: extra * quality,
      incremental_revenue_month: incRev, incremental_revenue_year: incRev * 12,
      incremental_gross_profit_month: incGp, incremental_operating_profit_month: incGp - monthly,
      first_year_revenue: firstYear, first_year_net: firstYearNet, roi: spend > 0 ? firstYearNet / spend : null,
      payback_month: payback === -1 ? null : payback + 1,
      hours_saved_month: model === "lead_gen" && minutes != null && share != null ? (grossLeads * minutes * share) / 60 : null,
      spare_capacity: capacity != null ? Math.max(0, capacity - customers) : null,
      low_month: revenue * (1 - swing), high_month: revenue * (1 + swing), cumulative,
    };
  });
  if (scenarios.some((s) => s.capped)) notes.push("At least one scenario is limited by capacity: demand above it is not counted as revenue.");
  if (quality < 1) notes.push(`Only ${Math.round(quality * 100)}% of additional inquiries are treated as qualified.`);
  return {
    ok: true, model, current, scenarios, confidence: confidenceOf(model, inputs), ramp_months: ramp, notes,
    costs: { implementation: impl, monthly, first_year: impl + monthly * 12 },
  };
}

/** The formulas in words, shown beside the results so each figure can be checked by hand. */
export function formulas(model: ModelKind): string[] {
  const base = model === "ecommerce"
    ? ["Orders = sessions × purchase conversion rate", "Monthly revenue = orders × average order value"]
    : ["Inquiries = relevant visits × visit-to-inquiry rate", "Customers = inquiries × inquiry-to-customer rate (extra inquiries count only at their qualified share)", "Monthly revenue = customers × average revenue per customer"];
  return [
    ...base,
    "Scenario traffic = visits × (1 + traffic change); scenario rate = rate × (1 + conversion change)",
    "Customers are capped at the stated capacity",
    "Incremental gross profit = (scenario revenue − current revenue) × gross margin",
    "Incremental operating profit = incremental gross profit − recurring cost",
    "First-year net = Σ months 1–12 of (incremental gross profit × ramp share − recurring cost) − implementation cost",
    "ROI = first-year net ÷ (implementation + 12 × recurring cost)",
    "Payback = first month the running total turns positive (up to 36 months)",
    "Hours saved = scenario inquiries × staff minutes per inquiry × share removed ÷ 60",
  ];
}
