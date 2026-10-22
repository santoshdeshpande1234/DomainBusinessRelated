// Growth plan: turns observed website gaps into Growth Engines. Pure, deterministic code, no AI calls.
//
// Every gap records its basis: "observed" on the prospect's own site, "competitor" (seen on the
// competitors compared), or "industry" (a recommendation for the industry, i.e. an assumption).
// The full plan, with internal evidence, stays in the studio. `clientGrowth` is the only part that
// reaches a client-facing preview: no competitor names, scores, prices or internal notes.
import type { Audit } from "@/lib/discovery/prospects";
import { featureMatrix, type Side } from "./competitors";

export type EngineKey = "lead_gen" | "sales" | "experience" | "retention" | "operations" | "search" | "insight";
export type Layer = EngineKey | "foundation";
export type Basis = "observed" | "competitor" | "industry";
export type DemoKey = "assistant" | "finder" | "qualify" | "booking" | "workflow";
export type DemoStatus = "working" | "simulated" | "proposed" | "not_configured";
type Level = 1 | 2 | 3;

export const DEMO_STATUS: Record<DemoStatus, { label: string; text: string }> = {
  working: { label: "Working demo", text: "Implemented and tested in this preview. It runs in the browser and sends nothing." },
  simulated: { label: "Simulated demo", text: "Shows the proposed experience. It is not connected to an AI model and does not run real business workflows." },
  proposed: { label: "Proposed integration", text: "Needs the business's accounts, API credentials or approval, and further development." },
  not_configured: { label: "Not configured", text: "Described here but not operational yet." },
};

export const ENGINES: Record<EngineKey, { name: string; outcome: string; capabilities: string[] }> = {
  lead_gen: { name: "AI Lead Generation Engine", outcome: "More qualified enquiries from the visitors you already get",
    capabilities: ["Intelligent visitor engagement", "AI-assisted enquiry capture and qualification", "Lead magnets, assessments and conversion-focused landing pages", "Automated CRM lead creation and routing", "Lead-source and campaign attribution"] },
  sales: { name: "AI Sales Conversion Engine", outcome: "More enquiries turned into bookings, quotes and customers",
    capabilities: ["Service recommendations", "Qualification workflows and appointment booking", "Automated enquiry follow-ups", "Quote, proposal and consultation requests", "Conversion funnel optimisation"] },
  experience: { name: "AI Customer Experience Engine", outcome: "Visitors find answers and the right service without waiting",
    capabilities: ["AI website concierge and business knowledge assistant", "Personalised visitor journeys", "Context-aware FAQs and service discovery", "Onboarding and self-service workflows", "Seamless escalation to staff"] },
  retention: { name: "AI Customer Retention & Revenue Engine", outcome: "More repeat business from existing customers",
    capabilities: ["Re-engagement automation", "Relevant cross-sell and upsell suggestions", "CRM-driven lifecycle campaigns", "Renewal and repeat-visit reminders", "Loyalty, review and referral workflows"] },
  operations: { name: "AI Operational Automation Engine", outcome: "Less repetitive admin for the team",
    capabilities: ["Automated enquiry processing", "Workflow orchestration and notifications", "Lead assignment and task creation", "Integration with existing business systems", "Fewer manual hand-offs"] },
  search: { name: "AI Search Visibility & Content Growth Engine", outcome: "Easier to find in search and AI answers (rankings are never guaranteed)",
    capabilities: ["Search-friendly site architecture", "Service and location landing pages", "Content strategy and publishing workflow", "Structured data and technical SEO", "Visibility in AI-generated search answers"] },
  insight: { name: "Business Intelligence & Optimisation Engine", outcome: "Know which channels and pages produce customers",
    capabilities: ["Conversion tracking and analytics", "Lead and campaign dashboards", "Funnel drop-off analysis", "Landing-page experiments", "KPI-based recommendations"] },
};

export const POSITIONING = "We don't just build websites. We transform your website into an intelligent growth platform that attracts prospects, converts opportunities, automates customer journeys, and helps your business grow.";

type Question = { label: string; options: string[] };
type Profile = {
  hero: string; customers: string; booking: boolean; quote: boolean; headline: string; promise: string;
  retention: { gap: string; solution: string; kpi: string }; ops: string; qualify: Question[]; rename: Partial<Record<EngineKey, string>>;
};

const PROFILES: Record<string, Profile> = {
  healthcare: { hero: "Book your visit to {name} in a minute", customers: "patients", booking: true, quote: false, headline: "Turn your website into a front desk that never closes",
    promise: "Request an appointment any time, get quick answers, and hear back from the clinic.",
    retention: { gap: "No recall or check-up reminders visible", solution: "Automated recall and check-up reminders", kpi: "Returning-patient bookings" },
    ops: "Appointment requests sorted by treatment and urgency, with the front desk notified",
    qualify: [{ label: "What do you need?", options: ["Routine check-up", "A specific treatment", "Urgent problem", "Not sure yet"] }, { label: "When would you like to come in?", options: ["This week", "In the next two weeks", "Just exploring"] }],
    rename: { experience: "AI Patient Experience Engine", retention: "AI Patient Recall & Retention Engine" } },
  professional_services: { hero: "Clear advice from {name}, starting with one conversation", customers: "clients", booking: true, quote: true, headline: "Win better-fit clients before the first call",
    promise: "Explain what you need, see how the team can help, and book a consultation.",
    retention: { gap: "No visible way to stay in touch with past clients", solution: "Renewal reminders and relevant follow-up content", kpi: "Repeat engagements" },
    ops: "Consultation requests triaged by service area and routed to the right adviser",
    qualify: [{ label: "What can we help with?", options: ["New matter or project", "Ongoing support", "A second opinion", "Not sure yet"] }, { label: "How soon do you need help?", options: ["Urgently", "This month", "Just planning"] }],
    rename: {} },
  real_estate: { hero: "Find your next property with {name}", customers: "buyers and sellers", booking: true, quote: false, headline: "Turn property searches into booked viewings",
    promise: "Tell us what you are looking for, book a viewing, and get updates on matching properties.",
    retention: { gap: "No alerts for past enquirers", solution: "Saved-search alerts and nurture emails for past enquirers", kpi: "Repeat enquiries from past contacts" },
    ops: "Viewing requests matched to the right agent, with reminders sent automatically",
    qualify: [{ label: "Are you buying, selling or renting?", options: ["Buying", "Selling", "Renting", "Just browsing"] }, { label: "When are you planning to move?", options: ["Within 3 months", "3–12 months", "Not sure"] }],
    rename: {} },
  hospitality: { hero: "Reserve your table or stay at {name}", customers: "guests", booking: true, quote: false, headline: "Fill more tables and rooms directly",
    promise: "Check availability, ask a question, and book directly.",
    retention: { gap: "No visible way to bring guests back", solution: "Return-visit offers and occasion reminders", kpi: "Repeat bookings" },
    ops: "Booking and event requests collected in one place, with staff alerted",
    qualify: [{ label: "What are you planning?", options: ["A table or stay", "A group or event", "A special occasion", "Just a question"] }, { label: "When?", options: ["This week", "This month", "Later"] }],
    rename: { experience: "AI Guest Experience Engine" } },
  education: { hero: "Find the right course at {name}", customers: "students and parents", booking: true, quote: false, headline: "Turn interest into enrolments",
    promise: "Find the right course, book a trial class, and get answers without waiting.",
    retention: { gap: "No re-enrolment or next-level prompts visible", solution: "Re-enrolment reminders and next-course suggestions", kpi: "Re-enrolment rate" },
    ops: "Trial and enrolment requests sorted by course and level, with the office notified",
    qualify: [{ label: "Who is the course for?", options: ["Myself", "My child", "A group", "Not sure"] }, { label: "When would you like to start?", options: ["This month", "Next term", "Just exploring"] }],
    rename: { experience: "AI Student Experience Engine" } },
  automotive: { hero: "Book your next service with {name}", customers: "drivers", booking: true, quote: true, headline: "Keep the workshop booked",
    promise: "Book a service, ask for a quote, and get a reminder when the next one is due.",
    retention: { gap: "No service-due reminders visible", solution: "Service-due and MOT/inspection reminders", kpi: "Repeat service bookings" },
    ops: "Service requests sorted by job type, with the workshop notified",
    qualify: [{ label: "What does your vehicle need?", options: ["Regular service", "Repair", "Inspection", "Not sure"] }, { label: "How soon?", options: ["Urgently", "This week", "Flexible"] }],
    rename: {} },
  home_services: { hero: "Get your job booked with {name}", customers: "homeowners", booking: false, quote: true, headline: "Turn searches into booked jobs",
    promise: "Describe the job, get a quote request in quickly, and hear back fast.",
    retention: { gap: "No maintenance reminders visible", solution: "Seasonal maintenance reminders and repeat-job offers", kpi: "Repeat jobs" },
    ops: "Job requests sorted by type and urgency, with the right technician notified",
    qualify: [{ label: "What kind of job is it?", options: ["Repair", "Installation", "Maintenance", "Not sure"] }, { label: "How urgent is it?", options: ["Emergency", "This week", "Planning ahead"] }],
    rename: {} },
  manufacturing: { hero: "Send {name} your specification and get a clear quote", customers: "buyers", booking: false, quote: true, headline: "Turn specification searches into qualified RFQs",
    promise: "Find the right capability, send a structured request for quote, and get a clear response.",
    retention: { gap: "No reorder or account follow-up visible", solution: "Reorder reminders and account follow-ups", kpi: "Repeat orders" },
    ops: "RFQs captured with specifications and routed to the right sales engineer",
    qualify: [{ label: "What do you need?", options: ["Request for quote", "Technical question", "Repeat order", "Partnership"] }, { label: "Expected timeline?", options: ["Under a month", "1–3 months", "Planning"] }],
    rename: {} },
  it: { hero: "Tell {name} what you need and get a clear plan", customers: "clients", booking: true, quote: true, headline: "Turn technical questions into qualified projects",
    promise: "Describe the problem, see relevant services, and book a discovery call.",
    retention: { gap: "No renewal or account follow-up visible", solution: "Renewal reminders and account health check-ins", kpi: "Renewals and expansions" },
    ops: "Support and project requests triaged and assigned automatically",
    qualify: [{ label: "What do you need?", options: ["New project", "Ongoing support", "Fix a problem", "Not sure"] }, { label: "Team size?", options: ["1–10", "11–50", "51+"] }],
    rename: {} },
  retail: { hero: "Plan your visit to {name}", customers: "shoppers", booking: false, quote: false, headline: "Bring more shoppers back, in store and online",
    promise: "See what is in store, ask a question, and plan your visit.",
    retention: { gap: "No repeat-purchase prompts visible", solution: "Repeat-purchase reminders and personalised offers", kpi: "Repeat purchase rate" },
    ops: "Product questions and reservations collected in one place, with staff alerted",
    qualify: [{ label: "What are you looking for?", options: ["A specific product", "Gift ideas", "Something in stock today", "Just browsing"] }, { label: "How will you shop?", options: ["Visit the store", "Collect an order", "Delivery"] }],
    rename: {} },
};
const GENERIC: Profile = { hero: "Tell {name} what you need", customers: "customers", booking: false, quote: true, headline: "Turn your website into your best salesperson",
  promise: "Tell us what you need and hear back quickly.",
  retention: { gap: "No visible way to bring customers back", solution: "Re-engagement and repeat-purchase reminders", kpi: "Repeat customers" },
  ops: "Enquiries sorted and routed automatically, with the team notified",
  qualify: [{ label: "What do you need?", options: ["A new service", "Ongoing help", "A question", "Not sure"] }, { label: "How soon?", options: ["Urgently", "This month", "Just exploring"] }],
  rename: {} };

export const profileFor = (industry: string) => PROFILES[industry] ?? GENERIC;
export const engineName = (k: EngineKey, industry: string) => profileFor(industry).rename[k] ?? ENGINES[k].name;

export type GrowthFacts = {
  name: string; industry: string; industryLabel: string; category: string | null; city: string | null;
  website: string | null; audit: Audit | null; phone: string | null; email: string | null; address: string | null;
  reviews: number | null; services: string[]; competitors: Side[];
};

export type Gap = {
  key: string; layer: Layer; basis: Basis;
  gap: string; why: string; solution: string; feature: string; automation: string; benefit: string; kpi: string;
  evidence: string; client_evidence: string; // evidence is internal; client_evidence never names competitors
  impact: Level; feasibility: Level; confidence: Level; dependencies: string[]; demo: DemoKey | null;
  score: number; priority: "high" | "medium" | "low";
};
export type Engine = { key: EngineKey; name: string; outcome: string; capabilities: string[]; gaps: string[]; kpis: string[]; score: number; primary: boolean };
export type Phase = { title: string; items: string[] };
export type Capability = { name: string; status: DemoStatus; note: string };
export type GrowthPlan = {
  version: 1; built_at: string; industry: string;
  verified: string[]; unverified: string[];
  gaps: Gap[]; engines: Engine[]; foundation: string[]; differentiation: string[]; strengths: string[];
  rollout: Phase[]; kpis: string[]; dependencies: string[]; capabilities: Capability[];
  summary: { problem: string; transformation: string; benefits: string[] };
};

const DEP = {
  crm: "Access to their CRM (or setting one up)",
  calendar: "Their booking or calendar system",
  ai: "An AI model API key and a business-approved knowledge base",
  analytics: "An analytics account they own",
  messaging: "An email or SMS sending service with consent",
  staff: "A named person to handle escalations",
  content: "Their approval of service and policy content",
};

const usable = (a: Audit | null): a is Audit => !!a && !a.error;
const sideOf = (f: GrowthFacts): Side => ({ name: f.name, audit: f.audit, reviews: f.reviews, rating: null, hasWebsite: !!f.website });

/** Every gap we can support with evidence, plus labelled industry recommendations. */
export function findGaps(f: GrowthFacts, year = new Date().getUTCFullYear()): Gap[] {
  const p = profileFor(f.industry);
  const a = usable(f.audit) ? f.audit : null;
  const matrix = featureMatrix(sideOf(f), f.competitors);
  const share = (k: string) => matrix.find((m) => m.key === k)?.share ?? null;
  const nComp = f.competitors.filter((c) => usable(c.audit)).length;
  const out: Omit<Gap, "score" | "priority">[] = [];
  type G = Omit<Gap, "score" | "priority" | "evidence" | "client_evidence" | "basis" | "confidence" | "dependencies" | "demo"> & Partial<Pick<Gap, "dependencies" | "demo">>;
  const site = (g: G, seen: string, compKey?: string) => {
    const sh = compKey ? share(compKey) : null;
    const many = sh != null && sh >= 0.5;
    out.push({
      dependencies: [], demo: null, ...g, basis: many ? "competitor" : "observed", confidence: 3, impact: many ? 3 : g.impact,
      evidence: `${seen}${sh != null ? ` ${Math.round(sh * nComp)} of ${nComp} competitors compared have it.` : ""}`,
      client_evidence: `Observed on your current website${many ? "; most nearby businesses we compared already offer this" : ""}.`,
    });
  };
  const industry = (g: G, why: string) => out.push({
    dependencies: [], demo: null, ...g, basis: "industry", confidence: 1,
    evidence: `Industry recommendation, not observed: ${why}`, client_evidence: "Recommended for your industry; not something we could observe from outside.",
  });

  if (!f.website) {
    site({ key: "no_site", layer: "search", gap: `No website listed for ${f.name}`, why: `${cap(p.customers)} searching online can only find other businesses.`,
      solution: "Launch a fast, mobile-first website", feature: "Complete website with service pages and a clear next step", automation: "Search-ready structure and structured data from day one",
      benefit: `${cap(p.customers)} can find and contact ${f.name} online`, kpi: "Website visits and enquiries", impact: 3, feasibility: 3, dependencies: [DEP.content] }, "The business listing has no website.");
  } else if (!a) {
    out.push({ key: "unverified", layer: "foundation", basis: "observed", confidence: 1, gap: "The current website could not be checked",
      why: "If visitors see the same failure, enquiries are lost.", solution: "Reliable hosting with uptime monitoring", feature: "Monitored, fast-loading site",
      automation: "Downtime alerts to the team", benefit: "The site is there when people look", kpi: "Uptime", impact: 2, feasibility: 3, dependencies: [], demo: null,
      evidence: f.audit?.error ? `Website check failed: ${f.audit.error}.` : "Website not checked yet.", client_evidence: "We could not load your website when we checked; details on it are unverified." });
  }

  if (a) {
    if (a.forms === 0) site({ key: "form", layer: "lead_gen", gap: "No enquiry form on the home page", why: "Visitors who won't phone have no easy way to get in touch.",
      solution: "AI-assisted enquiry capture with a few contextual questions", feature: "Short, mobile-first enquiry form on every page", automation: "Answers qualify the enquiry and create a CRM lead automatically",
      benefit: "Ask in under a minute, any time", kpi: "Visit-to-enquiry rate", impact: 3, feasibility: 3, dependencies: [DEP.crm], demo: "qualify" }, "No form found on the home page.", "form");
    if (a.cta.length === 0) site({ key: "cta", layer: "lead_gen", gap: "No clear call to action", why: "Visitors who are ready to act are not told what to do next.",
      solution: "One primary call to action, repeated through the page", feature: `“${p.booking ? "Book" : "Get a quote"}” buttons in the header, hero and each section`, automation: "Every click tracked as a conversion event",
      benefit: "The next step is always obvious", kpi: "Call-to-action click rate", impact: 2, feasibility: 3 }, "No common call-to-action phrase found.", "cta");
    if (!a.booking && p.booking) site({ key: "booking", layer: "sales", gap: "No online booking", why: `${cap(p.customers)} who want to book outside office hours have to wait or go elsewhere.`,
      solution: "Online booking with qualification questions", feature: "Booking request flow with preferred dates", automation: "Instant confirmation and reminders to cut no-shows",
      benefit: "Book in a minute, any time of day", kpi: "Online bookings per month; no-show rate", impact: 3, feasibility: 2, dependencies: [DEP.calendar, DEP.messaging], demo: "booking" }, "No booking link or booking wording found.", "booking");
    if (!a.pricing && p.quote) site({ key: "pricing", layer: "sales", gap: "No prices or guided quote request", why: "Buyers comparing options want an idea of cost before they get in touch.",
      solution: "Guided quote request (and price ranges if the business wants to publish them)", feature: "Step-by-step quote request", automation: "Quote requests routed to the right person with a follow-up reminder",
      benefit: "Get a relevant quote without back-and-forth", kpi: "Quote requests; quote-to-customer rate", impact: 2, feasibility: 2, dependencies: [DEP.crm, DEP.content], demo: "qualify" }, "No prices or pricing page found.", "pricing");
    if ((a.nav ?? []).length < 2) site({ key: "discovery", layer: "experience", gap: "Services are hard to discover", why: "Visitors can't quickly see whether the business offers what they need.",
      solution: "Clear service pages and a service finder", feature: "Service finder that matches a visitor's needs to a service", automation: "Recommendations based on the visitor's answers",
      benefit: "Find the right service in a few taps", kpi: "Service page views per visit; enquiries per service", impact: 2, feasibility: 3, dependencies: [DEP.content], demo: "finder" }, `Fewer than two service links in the site navigation (${(a.nav ?? []).length} found).`);
    if (a.chat === false) site({ key: "answers", layer: "experience", gap: "No way to get instant answers", why: "Simple questions wait for office hours, and some visitors leave instead.",
      solution: "AI website concierge trained only on the business's approved information", feature: "Assistant that answers common questions and hands over to staff", automation: "Unanswered questions escalated to the team with the conversation attached",
      benefit: "Answers in seconds, a person when needed", kpi: "Assisted conversations that become enquiries", impact: 2, feasibility: 2, dependencies: [DEP.ai, DEP.staff], demo: "assistant" }, "No chat or messaging widget detected on the home page.");
    if (!a.tel) site({ key: "tel", layer: "foundation", gap: "Phone number is not tap-to-call", why: "Mobile visitors must copy the number to call.", solution: "Tap-to-call everywhere the number appears",
      feature: "Tap-to-call header button", automation: "Calls from the site tracked as conversions", benefit: "One tap to call", kpi: "Calls from the website", impact: 2, feasibility: 3 }, "No tel: link found.", "tel");
    if (!a.viewport) site({ key: "mobile", layer: "foundation", gap: "Not built for mobile screens", why: "Most local searches happen on phones; pages that need zooming lose visitors.", solution: "Mobile-first responsive design",
      feature: "Layouts designed for phones first", automation: "—", benefit: "Easy to read and use on a phone", kpi: "Mobile bounce rate", impact: 3, feasibility: 3 }, "No viewport tag.", "mobile");
    if (!a.https) site({ key: "https", layer: "foundation", gap: "Not served over HTTPS", why: "Browsers warn visitors that the site is not secure.", solution: "HTTPS everywhere",
      feature: "Secure connection", automation: "Automatic certificate renewal", benefit: "No security warnings", kpi: "Bounce rate", impact: 2, feasibility: 3 }, "Final URL is not HTTPS.", "https");
    if (a.ms > 3000 || a.kb > 1200) site({ key: "speed", layer: "foundation", gap: "Slow or heavy home page", why: "Visitors leave pages that take long to load.", solution: "Lightweight, fast pages",
      feature: "Optimised pages and images", automation: "Performance monitoring", benefit: "Pages open quickly, even on mobile data", kpi: "Page load time", impact: 2, feasibility: 3 }, `First response ${(a.ms / 1000).toFixed(1)} s, ${a.kb} KB of HTML.`, "speed");
    if (!a.description || !a.schema) site({ key: "search", layer: "search", gap: "Search engines get little structured information", why: "Search engines and AI assistants rely on clear descriptions and structured data to show local businesses.",
      solution: "Service and location pages with structured data", feature: "Search descriptions, schema.org data and service landing pages", automation: "Content publishing workflow for new service and FAQ pages",
      benefit: "Easier to find for the services people search for", kpi: "Search impressions and clicks (no ranking is guaranteed)", impact: 2, feasibility: 3, dependencies: [DEP.content] },
      [!a.description && "No meta description", !a.schema && "no structured data"].filter(Boolean).join("; ") + ".", !a.schema ? "schema" : "description");
    if (a.copyright_year && a.copyright_year < year - 2) site({ key: "fresh", layer: "search", gap: "Website content looks out of date", why: "Visitors may wonder whether the business is still active.", solution: "Regular content updates",
      feature: "News, FAQ and service updates", automation: "Content calendar with drafting and approval workflow", benefit: "Current, trustworthy information", kpi: "Pages published per month", impact: 1, feasibility: 3, dependencies: [DEP.content] }, `Copyright notice last updated ${a.copyright_year}.`, "fresh");
    if (a.analytics === false) site({ key: "tracking", layer: "insight", gap: "No analytics or conversion tracking detected", why: "Without tracking, nobody can tell which channels or pages produce customers.",
      solution: "Conversion tracking and a simple KPI dashboard", feature: "Events for calls, forms, bookings and assistant chats", automation: "Weekly KPI summary for the owner",
      benefit: "Marketing spend goes where it works", kpi: "Cost per enquiry; enquiries by channel", impact: 2, feasibility: 3, dependencies: [DEP.analytics] }, "No common analytics tag found on the home page.");
  }

  if (!a || a.analytics === undefined) industry({ key: "tracking", layer: "insight", gap: "Conversion tracking not verified", why: "Without tracking, nobody can tell which channels or pages produce customers.",
    solution: "Conversion tracking and a simple KPI dashboard", feature: "Events for calls, forms, bookings and assistant chats", automation: "Weekly KPI summary for the owner",
    benefit: "Marketing spend goes where it works", kpi: "Cost per enquiry; enquiries by channel", impact: 2, feasibility: 3, dependencies: [DEP.analytics] }, "tracking could not be checked from the stored website check.");
  if (a && a.chat === undefined) industry({ key: "answers", layer: "experience", gap: "Instant answers not verified", why: "Simple questions wait for office hours, and some visitors leave instead.",
    solution: "AI website concierge trained only on the business's approved information", feature: "Assistant that answers common questions and hands over to staff", automation: "Unanswered questions escalated to the team",
    benefit: "Answers in seconds, a person when needed", kpi: "Assisted conversations that become enquiries", impact: 2, feasibility: 2, dependencies: [DEP.ai, DEP.staff], demo: "assistant" }, "the stored website check predates chat detection.");

  industry({ key: "follow_up", layer: "operations", gap: "Enquiry follow-up speed is unknown", why: "The first business to respond often wins the customer.", solution: p.ops,
    feature: "Every enquiry lands in one inbox with its answers", automation: "Instant acknowledgement to the customer and an alert to the team",
    benefit: "A fast, consistent reply", kpi: "Time to first response", impact: 2, feasibility: 2, dependencies: [DEP.crm, DEP.messaging], demo: "workflow" }, "response times cannot be observed from outside.");
  industry({ key: "retention", layer: "retention", gap: p.retention.gap, why: "Winning back an existing customer usually costs less than finding a new one.", solution: p.retention.solution,
    feature: "Opt-in for reminders and updates", automation: "CRM-driven reminder and re-engagement campaigns", benefit: "Timely, relevant reminders", kpi: p.retention.kpi,
    impact: 2, feasibility: 2, dependencies: [DEP.crm, DEP.messaging] }, "repeat-business programmes are rarely visible on a website.");

  // Public reviews are a listing fact; compare with the competitors' median when we have enough.
  const rev = f.competitors.map((c) => c.reviews).filter((x): x is number => x != null).sort((x, y) => x - y);
  if (f.reviews != null && rev.length >= 2) {
    const med = rev.length % 2 ? rev[(rev.length - 1) / 2] : (rev[rev.length / 2 - 1] + rev[rev.length / 2]) / 2;
    if (f.reviews < med) out.push({ key: "reviews", layer: "retention", basis: "competitor", confidence: 3, gap: "Fewer public reviews than nearby businesses",
      why: "People compare reviews when choosing a local business.", solution: "Automated review requests after each completed visit or job", feature: "Simple review page linked from follow-up messages",
      automation: "Review request sent automatically once the job is marked complete", benefit: "Easy to share feedback", kpi: "New reviews per month", impact: 2, feasibility: 3,
      dependencies: [DEP.crm, DEP.messaging], demo: null, evidence: `${f.reviews} public reviews; competitor median ${med}.`, client_evidence: "Compared with public listings of nearby businesses." });
  }

  // One row per key: an observed gap wins over the industry version of the same thing.
  const seen = new Set<string>();
  return out.filter((g) => (seen.has(g.key) ? false : (seen.add(g.key), true)))
    .map((g) => { const score = g.impact * 2 + g.feasibility + g.confidence; return { ...g, score, priority: score >= 11 ? "high" : score >= 8 ? "medium" : "low" } as Gap; })
    .sort((x, y) => y.score - x.score);
}

/** Groups gaps into engines, strongest first. Engines without a gap are left out. */
export function selectEngines(gaps: Gap[], industry: string, focus?: EngineKey | null): Engine[] {
  const keys = Object.keys(ENGINES) as EngineKey[];
  const engines = keys.map((k) => {
    const gs = gaps.filter((g) => g.layer === k);
    return {
      key: k, name: engineName(k, industry), outcome: ENGINES[k].outcome, capabilities: ENGINES[k].capabilities,
      gaps: gs.map((g) => g.key), kpis: [...new Set(gs.map((g) => g.kpi))], primary: false,
      // Led by its strongest gap; more gaps only break ties, so one big gap outranks several small ones.
      score: Math.max(0, ...gs.map((g) => g.score)) * 100 + gs.reduce((s, g) => s + g.score, 0) + (k === focus ? 100_000 : 0),
    };
  }).filter((e) => e.gaps.length).sort((a, b) => b.score - a.score);
  engines.slice(0, 3).forEach((e) => { e.primary = true; });
  return engines.map((e) => ({ ...e, score: e.key === focus ? e.score - 100_000 : e.score }));
}

export function buildPlan(f: GrowthFacts, opts: { focus?: EngineKey | null; now?: Date } = {}): GrowthPlan {
  const now = opts.now ?? new Date();
  const gaps = findGaps(f, now.getUTCFullYear());
  const engines = selectEngines(gaps, f.industry, opts.focus);
  const a = usable(f.audit) ? f.audit : null;
  const p = profileFor(f.industry);
  const name = (k: EngineKey) => engineName(k, f.industry);

  const verified = [
    f.website && a && `Home page of ${hostOf(a.final_url)} checked`,
    f.phone && "Phone number from the business listing",
    f.address && "Address from the business listing",
    f.services.length >= 2 && "Services from the website navigation",
    f.competitors.some((c) => usable(c.audit)) && `${f.competitors.filter((c) => usable(c.audit)).length} competitor website(s) compared`,
  ].filter((x): x is string => !!x);
  const unverified = [
    f.website && !a && "Current website (could not be loaded or not checked yet)",
    f.services.length < 2 && "Services (not listed in the site navigation)",
    !f.competitors.length && "Competitors (none added yet)",
    "Opening hours, prices and team details",
    "Response times and existing tools (CRM, booking system)",
  ].filter((x): x is string => !!x);

  // Client-safe sentences: counts only, never competitor names.
  const matrix = featureMatrix(sideOf(f), f.competitors).filter((m) => m.share != null);
  const differentiation = matrix.filter((m) => m.share === 0 && m.prospect === false)
    .map((m) => `None of the nearby businesses we compared offers ${m.label.toLowerCase()}. ${f.name} could be the first.`).slice(0, 4);
  const strengths = matrix.filter((m) => m.prospect === true && m.share! < 0.5)
    .map((m) => `${f.name} already has ${m.label.toLowerCase()}, which most nearby businesses we compared don't.`).slice(0, 3);

  const foundation = ["Fast, mobile-first website on a secure connection", "Clear service pages and calls to action", "Structured data and search-ready architecture", "Accessible design and readable text",
    ...gaps.filter((g) => g.layer === "foundation").map((g) => g.solution)];
  const dependencies = [...new Set(gaps.flatMap((g) => g.dependencies))];
  const quick = gaps.filter((g) => g.feasibility === 3 && g.layer !== "insight");
  const connect = gaps.filter((g) => g.feasibility < 3);
  const rollout: Phase[] = [
    { title: "Phase 1: Foundation and quick wins", items: [f.website ? "Rebuild the website on the new foundation" : "Launch the website", ...quick.map((g) => g.solution)] },
    { title: "Phase 2: Connect the Growth Engines", items: connect.map((g) => `${g.solution}${g.dependencies.length ? ` (needs ${g.dependencies[0].toLowerCase()})` : ""}`) },
    { title: "Phase 3: Measure and optimise", items: ["Conversion tracking and a KPI dashboard", "Monthly review of enquiries by channel and page", "Landing-page experiments on the main call to action"] },
  ].map((ph) => ({ ...ph, items: [...new Set(ph.items)] })).filter((ph) => ph.items.length);

  const capabilities: Capability[] = [
    { name: "Service finder", status: "working", note: "Runs in the browser from the services on this page; nothing is sent." },
    { name: "AI website concierge", status: "simulated", note: "Scripted answers from facts on this page. Not connected to an AI model." },
    { name: p.booking ? "Booking and qualification form" : "Quote and qualification form", status: "simulated", note: "Shows the proposed questions. Sends nothing." },
    { name: "Automated enquiry workflow", status: "simulated", note: "Shows the steps a real enquiry would follow. Nothing runs." },
    { name: "CRM lead creation, routing and follow-ups", status: "proposed", note: DEP.crm },
    { name: "Reminder and re-engagement campaigns", status: "proposed", note: DEP.messaging },
    { name: "Analytics and KPI dashboard", status: "proposed", note: DEP.analytics },
    { name: "AI model connection for the concierge", status: "not_configured", note: DEP.ai },
  ];

  const top = engines.filter((e) => e.primary).map((e) => e.name);
  const firstGaps = gaps.filter((g) => g.basis !== "industry").slice(0, 3).map((g) => g.gap.toLowerCase());
  return {
    version: 1, built_at: now.toISOString(), industry: f.industry, verified, unverified, gaps, engines, foundation: [...new Set(foundation)], differentiation, strengths,
    rollout, kpis: [...new Set(engines.flatMap((e) => e.kpis))].slice(0, 8), dependencies, capabilities,
    summary: {
      problem: firstGaps.length ? `${f.name}'s current online presence has ${list(firstGaps)}.` : `${f.name}'s website covers the basics; the opportunity is in automation and repeat business.`,
      transformation: `A ${(f.category ?? f.industryLabel).toLowerCase()} website rebuilt as a growth platform, led by ${list(top.length ? top : [name("lead_gen")])}.`,
      benefits: [...new Set(gaps.slice(0, 5).map((g) => g.benefit))],
    },
  };
}

// ---------------------------------------------------------------- client-facing part

export type ClientGrowth = {
  headline: string; positioning: string; promise: string; customers: string;
  gaps: { gap: string; why: string; solution: string; engine: string; automation: string; benefit: string; kpi: string; basis: Basis; note: string; priority: Gap["priority"] }[];
  engines: { key: EngineKey; name: string; outcome: string; points: string[]; kpis: string[]; primary: boolean }[];
  foundation: string[]; differentiation: string[]; strengths: string[]; rollout: Phase[]; kpis: string[]; dependencies: string[];
  capabilities: Capability[]; qualify: Question[]; today: { label: string; today: "yes" | "no" | "unknown"; proposed: string }[];
  segment: string | null; focus: EngineKey | null;
};

/** The part of a plan that a client may see. Built from scratch, so internal fields can't slip through. */
export function clientGrowth(plan: GrowthPlan, f: Pick<GrowthFacts, "name" | "industry" | "audit" | "website" | "services">, opts: { segment?: string | null; focus?: EngineKey | null } = {}): ClientGrowth {
  const p = profileFor(f.industry);
  const a = usable(f.audit) ? f.audit : null;
  const yn = (v: boolean | undefined): "yes" | "no" | "unknown" => (!f.website ? "no" : v === undefined || !a ? "unknown" : v ? "yes" : "no");
  const byKey = new Map(plan.gaps.map((g) => [g.key, g]));
  return {
    headline: p.headline, positioning: POSITIONING, promise: p.promise, customers: p.customers,
    gaps: plan.gaps.filter((g) => g.layer !== "foundation" || g.priority === "high").map((g) => ({
      gap: g.gap, why: g.why, solution: g.solution, engine: g.layer === "foundation" ? "Website foundation" : engineName(g.layer, f.industry),
      automation: g.automation, benefit: g.benefit, kpi: g.kpi, basis: g.basis, note: g.client_evidence, priority: g.priority,
    })),
    engines: plan.engines.map((e) => ({ key: e.key, name: e.name, outcome: e.outcome, primary: e.primary, kpis: e.kpis,
      points: [...new Set(e.gaps.map((k) => byKey.get(k)).filter((g): g is Gap => !!g).flatMap((g) => [g.feature, g.automation]).filter((x) => x !== "—"))].slice(0, 5) })),
    foundation: plan.foundation, differentiation: plan.differentiation, strengths: plan.strengths, rollout: plan.rollout, kpis: plan.kpis, dependencies: plan.dependencies,
    capabilities: plan.capabilities, qualify: p.qualify,
    today: [
      { label: "Enquiry form", today: !f.website ? "no" : a ? (a.forms > 0 ? "yes" : "no") : "unknown", proposed: "Short qualifying form on every page" },
      { label: p.booking ? "Online booking" : "Guided quote request", today: p.booking ? yn(a?.booking) : yn(a?.pricing), proposed: p.booking ? "Booking request with reminders" : "Step-by-step quote request" },
      { label: "Instant answers", today: yn(a?.chat), proposed: "AI concierge with hand-over to staff" },
      { label: "Built for phones", today: yn(a?.viewport), proposed: "Mobile-first design with tap-to-call" },
      { label: "Clear service pages", today: !f.website ? "no" : a ? (f.services.length >= 2 ? "yes" : "no") : "unknown", proposed: "Service pages and a service finder" },
      { label: "Search-ready structure", today: !f.website ? "no" : a ? (a.description && a.schema ? "yes" : "no") : "unknown", proposed: "Structured data and service landing pages" },
      { label: "Conversion tracking", today: yn(a?.analytics), proposed: "Calls, forms and bookings tracked" },
    ],
    segment: opts.segment ?? null, focus: opts.focus ?? null,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
