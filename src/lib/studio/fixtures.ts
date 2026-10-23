// Sample businesses for the automated browser suite (npm run test:e2e:sites). Each is built with the real
// generation pipeline from made-up inputs on .example domains, so nothing is fetched and no real business
// is shown. The route that renders them is disabled unless SITE_FIXTURES=1.
import type { Audit } from "@/lib/discovery/prospects";
import { compose } from "./compose";
import type { Inventory, PageRecord } from "./inventory";
import type { SiteContent, SiteFacts } from "./site";

const NOW = new Date("2026-10-22T00:00:00Z");
const audit = (url: string, o: Partial<Audit> = {}): Audit => ({
  url, final_url: url, status: 200, https: true, ms: 900, kb: 60, title: null, description: null, viewport: true, h1: 1,
  forms: 0, booking: false, cta: [], tel: true, emails: [], schema: false, copyright_year: 2024, generator: null, nav: [], headings: [], ...o,
});
const rec = (o: Partial<PageRecord> & { url: string; kind: PageRecord["kind"] }): PageRecord => ({
  status: "extracted", note: null, title: null, description: null, h1: null, headings: [], paragraphs: [], items: [], prices: [], faqs: [], claims: [],
  forms: 0, booking: false, phones: [], emails: [], quotes: [], ...o,
});
const facts = (o: Partial<SiteFacts> & Pick<SiteFacts, "name" | "industry" | "industryLabel">): SiteFacts => ({
  id: `fixture-${o.name}`, category: null, city: null, phone: null, email: null, address: null, maps_url: null, website: null, audit: null, ...o,
});

type Fixture = { label: string; facts: SiteFacts; inventory: Inventory | null; rating?: number; reviews?: number; theme?: string };

const NW = "https://northwind-hcm.example";
const SMILE = "https://smile-studio.example";
const FIXTURES: Record<string, Fixture> = {
  // An IT consultancy with a capability list, case studies, testimonials, careers and a LinkedIn profile.
  workday: {
    label: "Workday staffing consultancy",
    facts: facts({ name: "Northwind HCM Partners", industry: "it", industryLabel: "IT", category: "Workday consultancy", city: "Pune", phone: "+91 20 5555 0101", email: "hello@northwind-hcm.example",
      address: "4 Baner Road, Pune", website: NW + "/", audit: audit(NW + "/", { forms: 1, cta: ["contact us"], nav: ["Workday HCM", "Workday Payroll", "Staff augmentation"] }) }),
    inventory: {
      root: NW, crawled_at: NOW.toISOString(), sitemap: true, robots: true, queue: [], discovered: 9,
      brand: { logo: null, accent: "#0b5cad", ink: "#0f172a", colorsFrom: "the site's own styles", social: [{ network: "linkedin", url: "https://www.linkedin.com/company/northwind-hcm" }], image: null },
      pages: [
        rec({ url: NW + "/", kind: "home", h1: "Workday consultants who stay until it works", description: "Certified Workday consultants for implementation, support and staffing.",
          paragraphs: ["Northwind HCM Partners places experienced Workday consultants with HR and finance teams, for projects or long-term support."],
          items: ["HCM (All Modules)", "Payroll", "Recruiting", "Absence and Time Tracking", "Integrations", "Reporting and Prism Analytics"] }),
        rec({ url: NW + "/about", kind: "about", title: "About | Northwind HCM Partners", paragraphs: ["Founded in 2016 by two former Workday project leads, the team now supports clients across India and the UK."] }),
        rec({ url: NW + "/services/workday-hcm", kind: "service", h1: "Workday HCM", paragraphs: ["Configuration and support across core HCM, compensation, talent and benefits."], items: ["Core HCM", "Compensation", "Talent and Performance", "Benefits"] }),
        rec({ url: NW + "/services/workday-payroll", kind: "service", h1: "Workday Payroll", paragraphs: ["Payroll set-up, parallel runs and post go-live support for India and UK payroll."] }),
        rec({ url: NW + "/services/staff-augmentation", kind: "service", h1: "Staff augmentation", paragraphs: ["Vetted Workday consultants who join your team for a fixed term, remote or on site."] }),
        rec({ url: NW + "/case-studies/retail-payroll", kind: "case_study", title: "Payroll go-live for a retail group", description: "Moving 4,000 employees to Workday Payroll.",
          paragraphs: ["A retail group asked Northwind to run parallel payroll for three cycles before go-live. The team reconciled each run with finance."] }),
        rec({ url: NW + "/testimonials", kind: "testimonials", title: "Client feedback", quotes: ["“Their consultants knew Workday Payroll inside out and stayed through go-live.” – HR Director, retail group"] }),
        rec({ url: NW + "/careers", kind: "careers", title: "Careers", paragraphs: ["We hire experienced Workday HCM and Payroll consultants. Tell us about the modules you know best."] }),
        rec({ url: NW + "/contact", kind: "contact", h1: "Talk to us", paragraphs: ["Call or write to arrange a short call about your Workday project or staffing need."], forms: 1, phones: ["+91 20 5555 0101"], emails: ["hello@northwind-hcm.example"] }),
      ],
    },
    reviews: 14, rating: 4.8,
  },
  // A dentist that takes bookings, with articles and an older theme name.
  dentist: {
    label: "Dental clinic",
    facts: facts({ name: "Smile Studio", industry: "healthcare", industryLabel: "Healthcare", category: "Dentist", city: "Pune", phone: "+91 20 1111 2222", address: "1 FC Road, Pune",
      website: SMILE + "/", audit: audit(SMILE + "/", { booking: true, nav: ["Dental implants", "Braces", "Teeth whitening"] }) }),
    inventory: {
      root: SMILE, crawled_at: NOW.toISOString(), sitemap: false, robots: true, queue: [], discovered: 7,
      brand: { logo: null, accent: "#38bdf8", ink: null, colorsFrom: "theme-color tag", social: [{ network: "instagram", url: "https://www.instagram.com/smilestudio.example" }], image: null },
      pages: [
        rec({ url: SMILE + "/", kind: "home", h1: "Gentle dental care in Pune", paragraphs: ["We look after families across Pune with check-ups, implants and braces."], booking: true }),
        rec({ url: SMILE + "/about-us", kind: "about", paragraphs: ["Dr Rao opened Smile Studio on FC Road in 2009 to offer calm, unhurried dental care."] }),
        rec({ url: SMILE + "/services/dental-implants", kind: "service", h1: "Dental implants", paragraphs: ["Implants replace missing teeth with a fixed, natural-looking tooth."], prices: ["Implant consultation ₹ 1,500 including the scan."] }),
        rec({ url: SMILE + "/services/braces", kind: "service", h1: "Braces", items: ["Metal braces", "Clear aligners", "Retainers"] }),
        rec({ url: SMILE + "/services/teeth-whitening", kind: "service", h1: "Teeth whitening", paragraphs: ["In-clinic whitening in a single visit, after a check-up."] }),
        rec({ url: SMILE + "/blog/brushing-tips", kind: "article", title: "Five brushing tips", description: "How to brush properly.", paragraphs: ["Brush twice a day for two minutes with a soft brush, and replace it every three months."] }),
        rec({ url: SMILE + "/contact", kind: "contact", h1: "Contact us", paragraphs: ["Visit us at 1 FC Road, Pune, or call to arrange an appointment."], forms: 1 }),
      ],
    },
    reviews: 30, rating: 4.6, theme: "sage",
  },
  // A law firm whose website couldn't be read: the site is built from the listing only.
  lawfirm: {
    label: "Law firm (website not read)",
    facts: facts({ name: "Mehta & Rao Advocates", industry: "professional_services", industryLabel: "Professional services", category: "Law firm", city: "Mumbai", phone: "+91 22 4000 1234", address: "12 Fort Street, Mumbai" }),
    inventory: null,
  },
  // A plumber with no inventory and no phone published on the site, under the bold direction.
  plumber: {
    label: "Home services",
    facts: facts({ name: "FlowRight Plumbing", industry: "home_services", industryLabel: "Home services", category: "Plumber", city: "Bengaluru", email: "jobs@flowright.example",
      website: "https://flowright.example/", audit: audit("https://flowright.example/", { tel: false, viewport: false, nav: ["Leak repairs", "Bathroom fitting", "Water heaters", "Drain cleaning"] }) }),
    inventory: null,
  },
};

export const FIXTURE_KEYS = Object.keys(FIXTURES);

/** Builds one sample site with the real pipeline. */
export function fixtureSite(key: string): { content: SiteContent; theme: string; layout: string; label: string } | null {
  const f = FIXTURES[key];
  if (!f) return null;
  const r = compose({ facts: f.facts, reviews: f.reviews ?? null, rating: f.rating ?? null, competitors: [], others: ["Bright Teeth Clinic"], mode: "site", inventory: f.inventory, now: NOW });
  if (!r.ok) return null;
  return { content: r.content, theme: f.theme ?? r.design.theme, layout: r.design.layout, label: f.label };
}
