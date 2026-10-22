// Browser walkthrough of Phase 2 (domains, prospects, evidence) against a running app and local Supabase,
// seeded like walkthrough.mjs. External lookups are pre-loaded into research_cache so the test runs offline;
// that is the same cache path production uses for repeated lookups, so no provider is called or billed.
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const B = process.env.E2E_URL ?? "http://localhost:3000";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const step = (m) => console.log("✓", m);
const must = (ok, m) => { if (!ok) throw new Error(m); };

const { data: admin } = await db.from("memberships").select("workspace_id, user_id").eq("email", "admin@demo.local").single();
const ws = admin.workspace_id;
await db.from("integrations").delete().eq("workspace_id", ws).eq("provider", "google_places");
const { data: camp, error } = await db.from("campaigns").insert({
  workspace_id: ws, created_by: admin.user_id, name: `Pune clinics ${Date.now().toString(36)}`, industry: "healthcare", country: "India",
  region: "Maharashtra", city: "Pune", language: "English", currency: "INR", objectives: ["website_redesign"], domain_budget: 20000,
  prospect_budget: 500, max_prospects: 5, min_quality_score: 50, extensions: [".com", ".in"], limits: { max_domains: 3 },
  fx: { currency: "INR", usd_per_unit: 0.012, fetched_at: new Date().toISOString(), provider: "local-test-fixture" },
}).select("id").single();
if (error) throw error;
const id = camp.id;
const far = new Date(Date.now() + 864e5).toISOString();
await db.from("research_cache").upsert({ key: "rdap:bootstrap", provider: "iana", payload: { com: "https://rdap.test/com/", in: "https://rdap.test/in/" }, expires_at: far });
const query = `clinic in Pune, Maharashtra, India`;
const placesKey = "places:" + createHash("sha256").update(`${ws}|${query}||en`).digest("hex");
const place = (n, extra) => ({ id: `place-${n}`, name: `Clinic ${n}`, address: `${n} MG Road, Pune`, city: "Pune", region: "Maharashtra", country: "India",
  website: null, phone: `+91 20 0000 00${n}`, mapsUrl: `https://maps.google.com/?cid=${n}`, category: "Dentist", status: "OPERATIONAL", reviews: 40 * n, ...extra });
await db.from("research_cache").upsert({ key: placesKey, workspace_id: ws, provider: "google_places", expires_at: far,
  payload: { places: [place(1, { website: "https://clinic-one.example" }), place(2), place(3, { website: "http://www.clinic-one.example/" }), place(4, { status: "CLOSED_PERMANENTLY" })], next: null } });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
mkdirSync("test-results", { recursive: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror " + e.message));
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push("console " + m.text()));
const shot = (n) => page.screenshot({ path: `test-results/p2-${n}.png`, fullPage: true });

await page.goto(B + "/login"); await page.fill("#email", "admin@demo.local"); await page.fill("#password", "demo-password-1");
await page.click("button:has-text('Sign in')"); await page.waitForURL(B + "/", { waitUntil: "commit" });

// ---------------------------------------------------------------- domains
await page.goto(`${B}/campaigns/${id}`); await page.getByRole("link", { name: /Domain discovery \d+ domains/ }).click();
await page.getByText("No domains yet").waitFor();
await page.click("button:has-text('Generate ideas')"); await page.getByText(/new idea\(s\) added/).waitFor();
const { data: ideas } = await db.from("domains").select("name").eq("campaign_id", id);
must(ideas.length === 12, `expected 12 ideas (3 shortlist × 4), got ${ideas.length}`);
step(`generated ${ideas.length} ideas`);
// Registry answers: odd names registered, even names free.
await db.from("research_cache").upsert(ideas.map((d, i) => ({ key: `rdap:${d.name}`, provider: "rdap", expires_at: far,
  payload: i % 2 ? { status: "registered", source: `https://rdap.test/domain/${d.name}`, checked_at: new Date().toISOString(), registrar: "Test Registrar" }
    : { status: "unregistered", source: `https://rdap.test/domain/${d.name}`, checked_at: new Date().toISOString() } })));
await page.fill("#names", "PuneSmiles.com, bad_name, googleclinic.in");
await page.click("button:has-text('Add domains')"); await page.getByText("2 domain(s) added; 1 skipped as invalid.").waitFor(); step("manual domains validated");
await db.from("research_cache").upsert(["punesmiles.com", "googleclinic.in"].map((n) => ({ key: `rdap:${n}`, provider: "rdap", expires_at: far,
  payload: { status: "unregistered", source: `https://rdap.test/domain/${n}`, checked_at: new Date().toISOString() } })));
await page.click("button:has-text('Check registry')");
await page.getByText("Checked", { exact: false }).first().waitFor();
await page.waitForFunction(() => !document.querySelector("button[aria-busy='true']"), null, { timeout: 30000 });
await page.reload();
const { data: checked } = await db.from("domains").select("name, registry_status, score").eq("campaign_id", id);
must(checked.every((d) => d.registry_status !== "unchecked"), "all domains checked");
must(checked.find((d) => d.name === "googleclinic.in").score <= 30, "trademark cap");
step("registry checked in batches; scores capped for marks and registered names");
await shot("domains");

await page.selectOption("[aria-label='Registry status']", "unregistered");
const rows = page.locator("tbody tr");
must((await rows.count()) === 8, `filter shows 8 unregistered, got ${await rows.count()}`);
for (let i = 0; i < 4; i++) await rows.nth(i).locator("input[type=checkbox]").check();
await page.click("button:has-text('Shortlist')"); await page.getByText("This campaign allows 3 shortlisted domains.").waitFor(); step("shortlist limit enforced");
await rows.nth(3).locator("input[type=checkbox]").uncheck();
await page.click("button:has-text('Shortlist')"); await page.getByText("3 domain(s) marked shortlisted.").waitFor(); step("bulk shortlist");
await rows.nth(0).locator("input[type=checkbox]").check(); await rows.nth(1).locator("input[type=checkbox]").check();
await page.click("a:has-text('Compare')"); await page.getByRole("heading", { name: "Compare domains" }).waitFor();
await page.getByText("Brandability").waitFor(); await shot("compare"); step("compare");

await page.goBack(); await page.reload();
await page.locator("tbody tr").first().locator("a").click();
await page.getByText("Insufficient evidence").waitFor();
await page.fill("#price", "799"); await page.fill("#renewal_price", "999"); await page.fill("#source_url", "https://registrar.example/search");
await page.click("button:has-text('Record price')"); await page.getByText("Price recorded.").waitFor();
await page.fill("#sold_name", "puneclinic.co.in"); await page.fill("#cprice", "60000"); await page.fill("#sold_on", "2025-06-01"); await page.fill("#csource", "https://namebio.example/sale/1");
await page.click("button:has-text('Add comparable')"); await page.getByText("Comparable added.").waitFor();
await page.reload(); await page.getByText("Resale scenarios after 2 years").waitFor();
await page.getByRole("cell", { name: /1,798/ }).or(page.getByText(/holding cost of ₹1,798/)).first().waitFor();
await page.getByText("Comparable sale: puneclinic.co.in").waitFor();
page.once("dialog", (d) => d.accept());
await page.click("button:has-text('Approve for purchase review')"); await page.getByText("Approved for purchase review. Buy it yourself").waitFor();
await shot("domain-detail"); step("manual price, comparable, ROI scenarios and approval");

// ---------------------------------------------------------------- prospects
await page.goto(`${B}/campaigns/${id}/prospects`);
await page.getByText("Connect Google Places").waitFor();
await page.goto(B + "/settings/integrations");
await page.fill("#google_places-api_key", "AIza-test-key-123456");
await page.locator("article", { hasText: "Google Places" }).getByRole("button", { name: /^(Save|Update)$/ }).click();
await page.getByText("Google Places saved").waitFor();
await page.goto(`${B}/campaigns/${id}/prospects`);
await page.click("button:has-text('Find businesses')");
await page.getByText(`"${query}": 3 added, 1 duplicate(s) skipped (cached result, no charge).`).waitFor({ timeout: 20000 });
await page.waitForFunction(() => !document.querySelector("button[aria-busy='true']"), null, { timeout: 30000 });
step("Places results added, duplicate website skipped, cached page not billed");
// The next search term is not cached, and the sandbox has no network: the error must surface, not crash.
await page.getByText(/Google Places|fetch failed|Lookup failed|timed out|budget/i).first().waitFor();

const csv = "Company Name,URL,Telephone,Email,contact,title,colour\nClinic 2,,+91 20 0000 002,,,,red\nSmile Studio,smilestudio.example,,hello@smilestudio.example,Dr Rao,Owner,blue\nBright Teeth,brightteeth.example,,,,,\n";
await page.setInputFiles("#file", { name: "list.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
await page.click("button:has-text('Import')");
await page.getByText("2 imported, 1 duplicate(s) skipped. Ignored columns: colour.").waitFor(); step("CSV import with duplicate detection");
await page.reload();
must((await page.locator("tbody tr").count()) === 5, "5 prospects (campaign limit)");

await page.click("button:has-text('Check websites')");
await page.waitForFunction(() => !document.querySelector("button[aria-busy='true']"), null, { timeout: 60000 });
await page.getByText(/could not be loaded/).first().waitFor();
step("website checks run and record failures (sandbox has no outbound web)");
await page.reload();

await page.fill("[aria-label='Search prospects']", "smile");
must((await page.locator("tbody tr").count()) === 1, "search");
await page.fill("[aria-label='Search prospects']", "");
await page.locator("[aria-label='Select all shown']").check();
await page.click("button:has-text('Exclude')"); await page.getByText("5 prospect(s) excluded.").waitFor();
await page.selectOption("[aria-label='Status']", "excluded");
await page.locator("tbody tr", { hasText: "Smile Studio" }).locator("input[type=checkbox]").check();
await page.click("button:has-text('Reset')"); await page.getByText("1 prospect(s) restored.").waitFor(); step("filters, select-all and exclusion");
await shot("prospects");

const [dl] = await Promise.all([page.waitForEvent("download"), page.click("a:has-text('Export CSV')")]);
const text = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c).toString());
must(text.startsWith("name,website,phone,email") && text.includes("Smile Studio") && text.includes("hello@smilestudio.example"), "export contents");
step("CSV export");

await page.goto(`${B}/campaigns/${id}/prospects`);
await page.selectOption("[aria-label='Status']", "all");
await page.locator("tbody tr", { hasText: "Clinic 4" }).locator("a").click();
await page.getByText("Listed as closed permanently").waitFor();
await page.getByText("No website is listed for this business").waitFor();
await page.fill("#contact_name", "Dr Mehta");
await page.click("button:has-text('Save')"); await page.getByText("Add the page where you found these contact details.").waitFor();
must((await page.inputValue("#contact_name")) === "Dr Mehta", "form kept values");
await page.fill("#source_url", "https://clinic-four.example/team"); await page.click("button:has-text('Save')"); await page.getByText("Saved.").waitFor();
await page.reload(); await page.getByText("Contact details recorded").waitFor(); await page.getByText("Google Maps listing").first().waitFor();
await shot("prospect-detail"); step("prospect profile, sourced contact edits, evidence");

const { data: usage } = await db.from("api_usage").select("provider, est_cost_usd").eq("campaign_id", id);
must(usage.every((u) => Number(u.est_cost_usd) === 0), "no billed usage recorded for cached or failed lookups");
await page.goto(`${B}/campaigns/${id}`); await page.getByText("14 domains").waitFor(); await page.getByText("5 prospects").waitFor(); step("pipeline counts");
await page.goto(B + "/modules/prospects"); await page.getByText("Choose a campaign").waitFor(); step("module picker");
await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${B}/campaigns/${id}/prospects`);
must(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "no horizontal page overflow on mobile");
await shot("mobile-prospects"); step("mobile layout");

console.log("errors:", errors);
if (errors.length) process.exitCode = 1;
await browser.close();
await db.from("campaigns").delete().eq("id", id);
