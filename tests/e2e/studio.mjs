// Browser walkthrough of Phase 3 (competitors, financial model, website studio) against a running app and
// local Supabase. Prospects and their website checks are seeded directly, so nothing external is called.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const B = process.env.E2E_URL ?? "http://localhost:3000";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const step = (m) => console.log("✓", m);
const must = (ok, m) => { if (!ok) throw new Error(m); };

const { data: admin } = await db.from("memberships").select("workspace_id, user_id").eq("email", "admin@demo.local").single();
const ws = admin.workspace_id;
const { data: camp, error } = await db.from("campaigns").insert({
  workspace_id: ws, created_by: admin.user_id, name: `Pune dentists ${Date.now().toString(36)}`, industry: "healthcare", country: "India",
  region: "Maharashtra", city: "Pune", language: "English", currency: "INR", objectives: ["website_redesign"], domain_budget: 20000,
  prospect_budget: 500, max_prospects: 10, min_quality_score: 50, extensions: [".com", ".in"], limits: {},
  service_pricing: { website_build: 60000, website_redesign: 45000, monthly_retainer: 3000 },
  fx: { currency: "INR", usd_per_unit: 0.012, fetched_at: new Date().toISOString(), provider: "local-test-fixture" },
}).select("id").single();
if (error) throw error;
const id = camp.id;
const audit = (o) => ({ url: "https://x.example", final_url: "https://x.example/", status: 200, https: true, ms: 900, kb: 60, title: "Dentist", description: null, viewport: true, h1: 1,
  forms: 1, booking: false, cta: ["contact us"], tel: true, emails: [], schema: false, copyright_year: 2025, generator: null, nav: [], headings: [], pricing: false, ...o });
const now = new Date().toISOString();
const base = { workspace_id: ws, campaign_id: id, origin: "manual", category: "Dentist", city: "Pune", audited_at: now, created_by: admin.user_id, status: "new", phone: null, address: null };
const { data: ps, error: pe } = await db.from("prospects").insert([
  { ...base, name: "Smile Studio", website: "https://smile.example", website_host: "smile.example", dedupe_key: "smilestudio|pune", phone: "+91 20 1111 2222", address: "1 FC Road, Pune", status: "selected",
    audit: audit({ forms: 0, tel: false, viewport: false, title: "Smile Studio | Dentist Pune", nav: ["Dental implants", "Braces", "Teeth whitening"] }), score_detail: { reviews: 30 } },
  { ...base, name: "Bright Teeth", website: "https://bright.example", website_host: "bright.example", dedupe_key: "brightteeth|pune", audit: audit({ booking: true }), score_detail: { reviews: 120 } },
  { ...base, name: "Pune Dental Care", website: "https://pdc.example", website_host: "pdc.example", dedupe_key: "punedentalcare|pune", audit: audit({ pricing: true }), score_detail: { reviews: 80 } },
]).select("id, name");
if (pe) throw pe;
const pid = ps.find((p) => p.name === "Smile Studio").id;
await db.from("domains").insert({ workspace_id: ws, campaign_id: id, name: `smilestudiopune${Date.now().toString(36)}.in`, tld: ".in", origin: "manual", status: "shortlisted", registry_status: "unregistered" });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
mkdirSync("test-results", { recursive: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()} ${e.message}`));
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push("console " + m.text()));
page.on("dialog", (d) => d.accept());
const shot = (n, p = page) => p.screenshot({ path: `test-results/p3-${n}.png`, fullPage: true });

await page.goto(B + "/login"); await page.fill("#email", "admin@demo.local"); await page.fill("#password", "demo-password-1");
await page.click("button:has-text('Sign in')"); await page.waitForURL(B + "/", { waitUntil: "commit" });

// ---------------------------------------------------------------- overview
await page.goto(`${B}/campaigns/${id}`);
await page.getByRole("link", { name: /Competitor analysis 0 competitors tracked/ }).click();
await page.getByRole("link", { name: "Smile Studio" }).waitFor(); await shot("overview"); step("campaign overview lists selected prospects");

// ---------------------------------------------------------------- competitors
await page.goto(`${B}/campaigns/${id}/prospects/${pid}`);
await page.getByRole("link", { name: /Competitor analysis Not started/ }).click();
await page.click("button:has-text('Use businesses from this campaign')"); await page.getByText("Added 2 competitor(s) from this campaign.").waitFor();
await page.reload();
await page.getByText("Inquiry form on the home page: 2 of 2 competitors (100%) have it").waitFor();
await page.getByText("None of the 2 compared businesses, including Smile Studio, has structured data").waitFor();
must(await page.getByText("Assumption", { exact: true }).count() > 0, "assumptions labelled");
await page.getByRole("heading", { name: "Recommended improvements" }).waitFor();
must((await page.locator("ol li").first().innerText()).includes("Add an inquiry form"), "most common gap first");
await page.fill("#name", "Walk-in Dental"); await page.fill("#website", "smile.example"); await page.fill("#source_url", "https://maps.example/x");
await page.click("button:has-text('Add competitor')"); await page.getByText("That website is already in this comparison.").waitFor();
await shot("competitors"); step("competitors from campaign, comparison, facts vs assumptions, duplicate guard");

// ---------------------------------------------------------------- financial model
await page.goto(`${B}/campaigns/${id}/prospects/${pid}/financials`);
await page.getByText("Nothing is estimated until the required inputs are present").waitFor();
await page.click("button:has-text('Fill blanks with starter assumptions')");
await page.getByText(/Still needed before we can calculate: Relevant monthly website visits/).waitFor();
must(await page.inputValue("#implementation_cost") === "45000", "redesign price taken from campaign");
must(await page.inputValue("#base_conversion") === "25", "starter uplift shown as percent");
await page.fill("#visits", "1000"); await page.fill("#lead_rate", "2"); await page.fill("#close_rate", "25"); await page.fill("#revenue_per_customer", "8000"); await page.fill("#gross_margin", "60");
await page.selectOption("[aria-label='Gross margin: where it comes from']", "benchmark");
await page.click("button:has-text('Save and calculate')"); await page.getByText("Gross margin: a benchmark needs its source link").waitFor();
await page.fill("[aria-label='Gross margin: source link or note']", "https://example.org/dental-margins");
await page.click("button:has-text('Save and calculate')"); await page.getByText("Saved and recalculated.").waitFor();
await page.reload();
// Base: 1100 visits × 2.5% = 27.5 inquiries; 20 + 7.5 × 70% = 25.25 × 25% = 6.3125 customers × 8000 = 50,500 vs 40,000 now.
await page.getByText("₹126,000").first().waitFor();
await page.getByRole("img", { name: "Running net position by month for each scenario" }).waitFor();
const { data: fm } = await db.from("financial_models").select("confidence, results, inputs").eq("prospect_id", pid).single();
must(fm.inputs.lead_quality.basis === "assumption" && fm.inputs.visits.basis === "actual" && fm.inputs.gross_margin.basis === "benchmark", "bases kept through a save");
must(Math.round(fm.results.scenarios[1].incremental_revenue_year) === 126000, `base case ${fm.results.scenarios[1].incremental_revenue_year}`);
must(fm.confidence === 67, `confidence ${fm.confidence}`);
await shot("financials"); step(`financial model: base case ₹126,000/yr, ${fm.confidence}% confidence (assumptions kept as assumptions), chart rendered`);

// ---------------------------------------------------------------- website studio
await page.goto(`${B}/campaigns/${id}/prospects/${pid}/website`);
await page.click("button:has-text('Create draft')"); await page.getByText(/Draft created; 1 item\(s\) need your input/).waitFor();
await page.reload();
await page.getByText("1 placeholder(s) to fill before it can be marked ready").waitFor();
must(await page.locator("button:has-text('Mark ready')").isDisabled(), "ready blocked by placeholders");
const frame = page.frameLocator("iframe");
await frame.getByRole("heading", { name: "Dentist in Pune" }).waitFor();
await frame.getByText("Dental implants").waitFor();
await frame.getByText("Not the business's live website").waitFor();
await page.fill("#about", "Smile Studio is a family dental practice on FC Road.");
await page.selectOption("#domain_id", { index: 1 });
await page.click("button:has-text('Save')"); await page.getByText("Saved.", { exact: true }).waitFor();
await page.reload();
await page.click("button:has-text('Mark ready')"); await page.getByText("Marked ready.").waitFor();
await page.reload();
await page.click("button:has-text('Turn on share link')"); await page.getByText("Anyone with the link can now view it.").waitFor();
const { data: w } = await db.from("website_previews").select("token, share_enabled, status").eq("prospect_id", pid).single();
must(w.share_enabled && w.status === "ready", "shared");
await shot("studio");

// A visitor without an account sees the shared preview, with the concept banner and noindex.
const anon = await browser.newPage({ viewport: { width: 390, height: 844 } });
const res = await anon.goto(`${B}/preview/${w.token}`);
must(res.status() === 200, `shared preview ${res.status()}`);
must(/noindex/.test(res.headers()["x-robots-tag"] ?? ""), "noindex header");
await anon.getByText(/is a proposed domain, not yet owned/).waitFor();
await anon.getByText("Preview only: this form is not connected and sends nothing.").waitFor();
must(await anon.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal scroll on mobile");
await shot("preview-mobile", anon);
step("preview shared: public, labelled as a concept, noindex, mobile-safe");

await page.click("button:has-text('Turn off share link')"); await page.getByText("Link turned off.").waitFor();
must((await anon.goto(`${B}/preview/${w.token}`)).status() === 404, "unshared preview hidden");
await page.click("button:has-text('New link')"); await page.getByText("New link created").waitFor();
must((await page.goto(`${B}/preview/${w.token}`)).status() === 404, "old link dead after replacement");
step("sharing off hides it; a new link retires the old one");

const audit2 = await db.from("audit_logs").select("action").eq("resource_type", "website_previews").eq("workspace_id", ws).gte("created_at", now);
must(audit2.data.length >= 3, "preview changes audited");

await browser.close();
if (errors.length) { console.log(errors.join("\n")); process.exit(1); }
console.log("Phase 3 walkthrough passed");
