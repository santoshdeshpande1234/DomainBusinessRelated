// Proposals and outreach email drafts, built deterministically from what the studio has already saved for a
// prospect: the client-safe growth plan (never the internal one, which can name competitors), the
// competitive position in counts only, the financial model and the campaign's service prices. Nothing is
// invented: a missing price or figure stays missing and is listed for the team to fill in before "ready".
import type { ClientGrowth, Phase } from "@/lib/studio/growth";
import type { Results } from "@/lib/studio/financial";

export type Pricing = { website_build?: number | null; website_redesign?: number | null; monthly_retainer?: number | null };
export type Line = { key: string; label: string; detail: string; amount: number | null; recurring: "one-time" | "monthly" };
export type ScopeItem = { item: string; detail: string; status: "included" | "needs integration" | "proposed" };
export type EmailKey = "intro" | "follow_up_1" | "follow_up_2";
export type EmailDraft = { key: EmailKey; label: string; send_after_days: number; subject: string; body: string };

export type Proposal = {
  version: 1; built_at: string; currency: string;
  title: string;
  prepared_for: { name: string; contact: string | null; city: string | null; website: string | null };
  prepared_by: { company: string; website: string | null; sender: string | null };
  date: string; valid_until: string;
  summary: string;
  situation: { headline: string | null; points: string[]; today: { label: string; today: "yes" | "no" | "unknown"; proposed: string }[] };
  objectives: string[];
  recommendation: { engines: { name: string; outcome: string; points: string[] }[]; foundation: string[] };
  scope: ScopeItem[];
  rollout: Phase[];
  investment: { lines: Line[]; one_time: number | null; monthly: number | null; first_year: number | null; note: string };
  impact: { available: boolean; confidence: number | null; scenarios: { label: string; revenue_year: number; first_year_net: number; roi: number | null; payback_month: number | null }[]; note: string };
  kpis: string[];
  dependencies: string[];
  assumptions: string[];
  next_steps: string[];
  preview: { url: string | null; note: string };
};

/** What the team must fill in before the proposal can be marked ready, and checks worth a look. Internal. */
export type ProposalCheck = { missing: string[]; warnings: string[] };

export type ProposalInput = {
  business: { name: string; city: string | null; category: string | null; website: string | null; contact_name: string | null; contact_role: string | null; email: string | null };
  company: { name: string; website: string | null; sender: string | null };
  currency: string;
  pricing: Pricing;
  /** The client-safe growth plan from the website preview. */
  growth: ClientGrowth | null;
  /** The preview link, only when it is shared (a private link would not open for the client). */
  previewUrl: string | null;
  financial: Results | null;
  /** Names the client-facing text must never contain (other prospects, competitors). */
  others: string[];
  now?: Date;
};

const VALID_DAYS = 30;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const first = (name: string | null) => name?.trim().split(/\s+/)[0] ?? null;
const host = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : null; } catch { return null; } };
const sum = (xs: (number | null)[]) => (xs.some((x) => x == null) ? null : xs.reduce<number>((n, x) => n + (x ?? 0), 0));

export function buildProposal(x: ProposalInput): { proposal: Proposal; emails: EmailDraft[]; check: ProposalCheck } {
  const now = x.now ?? new Date();
  const g = x.growth;
  const b = x.business;
  const missing: string[] = [];
  const warnings: string[] = [];
  if (!g) missing.push("Generate the website preview and growth plan first; the proposal is built from it.");
  if (!x.company.name.trim()) missing.push("Your company name (Settings → Workspace).");
  if (!x.company.sender?.trim()) warnings.push("No sender name in Settings → Workspace; emails are signed with the company name only.");

  const primary = g?.engines.filter((e) => e.primary) ?? [];
  const engines = (primary.length ? primary : g?.engines.slice(0, 3) ?? []).map((e) => ({ name: e.name, outcome: e.outcome, points: e.points.slice(0, 4) }));

  // Investment: the campaign's own prices; a missing price is "to be confirmed", never estimated.
  const build = b.website ? x.pricing.website_redesign ?? null : x.pricing.website_build ?? null;
  const lines: Line[] = [
    { key: "website", label: b.website ? "Website redesign" : "New website", recurring: "one-time", amount: build,
      detail: `${g?.foundation.slice(0, 3).join("; ") || "Responsive, search-ready website"}, built from ${b.name}'s own content and the growth plan.` },
    { key: "retainer", label: "Growth retainer", recurring: "monthly", amount: x.pricing.monthly_retainer ?? null,
      detail: engines.length ? `Running and improving ${engines.map((e) => e.name).join(", ")}, with monthly reporting on the agreed KPIs.` : "Ongoing improvements and monthly reporting." },
  ];
  for (const l of lines) if (l.amount == null) missing.push(`Price for "${l.label}" (campaign or workspace service pricing).`);
  const oneTime = sum(lines.filter((l) => l.recurring === "one-time").map((l) => l.amount));
  const monthly = sum(lines.filter((l) => l.recurring === "monthly").map((l) => l.amount));

  // Impact: only from a complete financial model, labelled as an estimate with its confidence.
  const f = x.financial?.ok ? x.financial : null;
  if (!f) warnings.push(x.financial && !x.financial.ok ? `The financial model needs: ${x.financial.missing.slice(0, 4).join(", ")}. The proposal shows no impact figures until then.` : "No financial model yet; the proposal shows no impact figures.");
  if (f && oneTime != null && Math.abs(f.costs.implementation - oneTime) > 0.5) warnings.push(`The financial model assumes an implementation cost of ${f.costs.implementation}, but the proposal price is ${oneTime}. Update one so the ROI matches the price.`);
  if (f && monthly != null && Math.abs(f.costs.monthly - monthly) > 0.5) warnings.push(`The financial model assumes ${f.costs.monthly} a month, but the retainer is ${monthly}.`);
  if (f && f.confidence < 50) warnings.push(`Impact figures rest mostly on assumptions (${f.confidence}% confidence); consider replacing them with the business's own figures first.`);

  // Scope: website foundation, then each recommended solution with an honest status.
  const capStatus = new Map((g?.capabilities ?? []).map((c) => [c.name.toLowerCase(), c.status]));
  const scope: ScopeItem[] = [
    ...(g?.foundation ?? []).slice(0, 6).map((item): ScopeItem => ({ item, detail: "Part of the website build.", status: "included" })),
    ...(g?.gaps ?? []).slice(0, 8).map((gap): ScopeItem => {
      const needs = /crm|calendar|booking system|api key|sending service|analytics account/i.test(gap.automation) || capStatus.get(gap.solution.toLowerCase()) === "proposed";
      return { item: gap.solution, detail: `${gap.benefit}${gap.automation && gap.automation !== "—" ? ` (${gap.automation})` : ""}`, status: needs ? "needs integration" : "included" };
    }),
  ];

  const pos = g?.position;
  const situationPoints = [
    ...(g?.gaps ?? []).filter((x) => x.basis === "observed").slice(0, 4).map((x) => `${x.gap}: ${x.why}`),
    ...(pos?.dimensions ?? []).filter((d) => d.position === "behind").slice(0, 2).map((d) => `Behind nearby businesses on ${d.name.toLowerCase()}${d.points[0] ? ` (${d.points[0]})` : ""}.`),
  ];
  const objectives = engines.map((e) => e.outcome).filter(Boolean);

  const proposal: Proposal = {
    version: 1, built_at: now.toISOString(), currency: x.currency,
    title: `Growth proposal for ${b.name}`,
    prepared_for: { name: b.name, contact: b.contact_name ? `${b.contact_name}${b.contact_role ? `, ${b.contact_role}` : ""}` : null, city: b.city, website: host(b.website) },
    prepared_by: { company: x.company.name.trim() || "Your company", website: host(x.company.website), sender: x.company.sender?.trim() || null },
    date: iso(now), valid_until: iso(new Date(now.getTime() + VALID_DAYS * 86_400_000)),
    summary: g
      ? `${g.headline} We propose ${b.website ? "rebuilding" : "building"} ${b.name}'s website as the foundation and running ${engines.length ? engines.map((e) => e.name).join(", ") : "focused growth improvements"} on top of it, so that ${objectives[0]?.replace(/\.$/, "").toLowerCase() ?? "more of the right customers get in touch"}.`
      : `A proposal for ${b.name}, to be completed once the growth plan is ready.`,
    situation: { headline: pos?.headline ?? null, points: situationPoints, today: g?.today ?? [] },
    objectives,
    recommendation: { engines, foundation: g?.foundation ?? [] },
    scope,
    rollout: g?.rollout ?? [],
    investment: {
      lines, one_time: oneTime, monthly, first_year: oneTime != null && monthly != null ? oneTime + 12 * monthly : null,
      note: "Prices exclude taxes and any third-party subscriptions (hosting, booking, messaging or CRM tools), which are billed at cost or directly to you.",
    },
    impact: f ? {
      available: true, confidence: f.confidence,
      scenarios: f.scenarios.map((s) => ({ label: s.label, revenue_year: s.incremental_revenue_year, first_year_net: s.first_year_net, roi: s.roi, payback_month: s.payback_month })),
      note: `Estimates from the figures in our model (${f.confidence}% from your actual figures or published benchmarks, the rest assumptions). They illustrate the opportunity and are not a promise of results.`,
    } : { available: false, confidence: null, scenarios: [], note: "We'll estimate the impact together once we have your figures for enquiries, conversion and customer value." },
    kpis: g?.kpis.slice(0, 8) ?? [],
    dependencies: g?.dependencies ?? [],
    assumptions: [
      "Content comes from your current website and what you confirm; we don't publish claims, reviews or figures you haven't approved.",
      "Integrations (booking, CRM, messaging, analytics) use accounts you own; they go live once access is granted.",
      `This proposal is valid for ${VALID_DAYS} days.`,
    ],
    next_steps: [
      "A 30-minute call to walk through the proposal and the website concept.",
      "Confirm scope, priorities and the figures behind the impact estimate.",
      "Agree the start date; the first phase begins within two weeks of sign-off.",
    ],
    preview: x.previewUrl ? { url: x.previewUrl, note: "A working concept of the proposed website, built from your current content." }
      : { url: null, note: "A concept of the proposed website is ready to show on our call." },
  };
  if (!x.previewUrl && g) warnings.push("The website preview isn't shared, so the proposal and emails don't link to it. Turn on its share link to include it.");

  const emails = buildEmails(x, proposal);
  check(proposal, emails, x.others, missing);
  return { proposal, emails, check: { missing: [...new Set(missing)], warnings: [...new Set(warnings)] } };
}

/** First outreach and two follow-ups. Only observed gaps are mentioned; nothing is sent from here. */
export function buildEmails(x: ProposalInput, p: Proposal): EmailDraft[] {
  const b = x.business;
  const hi = first(b.contact_name) ? `Hi ${first(b.contact_name)},` : `Hello ${b.name} team,`;
  const sign = [p.prepared_by.sender, p.prepared_by.company !== "Your company" ? p.prepared_by.company : null, p.prepared_by.website].filter(Boolean).join("\n");
  const observed = (x.growth?.gaps ?? []).filter((g) => g.basis === "observed").slice(0, 2);
  const site = host(b.website);
  const look = site ? `I spent some time on ${site}${b.city ? ` and how ${b.name} shows up for customers in ${b.city}` : ""}.` : `I noticed ${b.name} doesn't have a website listed${b.city ? ` for customers searching in ${b.city}` : ""}.`;
  const points = observed.length ? `\n\nA couple of things stood out:\n${observed.map((g) => `- ${g.gap}. ${g.why}`).join("\n")}` : "";
  const preview = p.preview.url ? `\n\nI put together a concept of what a new site could look like, built from your current content: ${p.preview.url}` : "\n\nI've put together a short proposal and a concept of what a new site could look like.";
  const out = "\n\nIf this isn't relevant, just reply and I won't follow up.";
  return [
    { key: "intro", label: "First email", send_after_days: 0,
      subject: observed[0] ? `${b.name}: ${observed[0].gap.charAt(0).toLowerCase()}${observed[0].gap.slice(1)}` : `An idea for ${b.name}'s website`,
      body: `${hi}\n\n${look}${points}${preview}\n\nWould a 15-minute call next week be useful? I can walk you through it and you can keep the proposal either way.${out}\n\n${sign}` },
    { key: "follow_up_1", label: "Follow-up (day 3)", send_after_days: 3,
      subject: `Re: ${observed[0] ? `${b.name}: ${observed[0].gap.charAt(0).toLowerCase()}${observed[0].gap.slice(1)}` : `An idea for ${b.name}'s website`}`,
      body: `${hi}\n\nJust bringing this back to the top of your inbox. The proposal covers ${p.recommendation.engines.length ? p.recommendation.engines.map((e) => e.name).join(", ") : "a new website and the improvements behind it"}, with a phased rollout${p.investment.one_time != null ? " and clear pricing" : ""}.${p.preview.url ? `\n\nThe concept site is here if you'd like a look: ${p.preview.url}` : ""}\n\nHappy to send the PDF over if that's easier than a call.${out}\n\n${sign}` },
    { key: "follow_up_2", label: "Last follow-up (day 7)", send_after_days: 7,
      subject: `Closing the loop for ${b.name}`,
      body: `${hi}\n\nI'll leave it here so I don't clutter your inbox. If improving how ${b.name} turns website visitors into ${x.growth?.customers ?? "customers"} becomes a priority, just reply to this email and I'll send the proposal over.\n\nAll the best,\n\n${sign}` },
  ];
}

/** Client-facing text must not name another business or leave a placeholder. */
function check(p: Proposal, emails: EmailDraft[], others: string[], missing: string[]) {
  const text = JSON.stringify(p) + JSON.stringify(emails);
  for (const n of others) if (n.trim().length > 2 && text.toLowerCase().includes(n.trim().toLowerCase())) missing.push(`Remove the mention of another business ("${n}").`);
  if (/\[\[/.test(text)) missing.push("Fill the [[placeholders]] in the website content first.");
}

export const EMAIL_LIMITS = { subject: 160, body: 4000 };
