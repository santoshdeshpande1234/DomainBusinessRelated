// Browser walkthrough of Phase 1 against a running app (`npm run build && npm start`) seeded by
// `scripts/bootstrap-admin.mjs --email admin@demo.local --password demo-password-1`. Screenshots go to test-results/.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const B = process.env.E2E_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
mkdirSync("test-results", { recursive: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console " + m.text()));
const shot = (n) => page.screenshot({ path: `test-results/${n}.png`, fullPage: true });
const step = (m) => console.log("✓", m);

await page.goto(B + "/campaigns");
await page.waitForURL(/\/login\?next=%2Fcampaigns/, { waitUntil: "commit" }); step("redirects to login with next");
await shot("01-login");
await page.fill("#email", "admin@demo.local"); await page.fill("#password", "wrong");
await page.click("button:has-text('Sign in')"); await page.getByText("Email or password is incorrect").waitFor(); step("bad password rejected");
await page.fill("#password", "demo-password-1"); await page.click("button:has-text('Sign in')");
await page.waitForURL(B + "/campaigns", { waitUntil: "commit" }); step("login lands on next path");
await page.goto(B + "/"); await page.getByText("Get set up").waitFor(); await shot("02-dashboard"); step("dashboard");

await page.goto(B + "/campaigns/new");
await page.click("button:has-text('Continue')"); await page.getByText("At least 3 characters").waitFor(); step("step validation blocks");
await page.fill("#name", "Pune dental clinics");
await page.selectOption("#industry", "custom"); await page.click("button:has-text('Continue')");
await page.getByText("Describe the custom industry").waitFor(); await page.fill("#custom_industry", "Dental clinics");
await page.click("button:has-text('Continue')");
await page.fill("#country", "India"); await page.fill("#city", "Pune");
await shot("03-wizard-market"); await page.click("button:has-text('Continue')");
await page.click("button:has-text('Continue')"); await page.getByText("Choose at least one objective").waitFor();
await page.getByText("Website redesign", { exact: true }).click(); await page.getByText("Lead generation", { exact: true }).click();
await page.click("button:has-text('Continue')");
await page.fill("#domain_budget", "25000"); await page.fill("#prospect_budget", "8000");
await page.click("button[aria-pressed]:has-text('.in')");
await page.fill("[aria-label='Custom extension']", "clinic"); await page.click("button:has-text('Add')");
await page.fill("#limits\\.daily_email_limit", "30");
await shot("04-wizard-budget"); await page.click("button:has-text('Continue')");
await page.fill("#service_pricing\\.website_redesign", "45000");
await shot("05-wizard-review");
await page.click("button:has-text('Create campaign')");
await page.waitForURL(/\/campaigns\/[0-9a-f-]{36}\?created=1/, { waitUntil: "commit" }); step("campaign created");
await page.getByText("≈ $300").first().waitFor(); step("USD equivalent from saved rate (25000 INR ≈ $300)");
await page.getByText(".clinic").waitFor();
await shot("06-campaign-detail");
await page.click("button:has-text('Activate')"); await page.getByText("Active", { exact: true }).first().waitFor(); step("status change");
const id = page.url().split("/campaigns/")[1].split("?")[0];
await page.goto(`${B}/campaigns/${id}/edit`); await page.fill("#name", "Pune dental clinics 2026");
for (let i = 0; i < 4; i++) await page.click("button:has-text('Continue')");
await page.click("button:has-text('Save changes')"); await page.waitForURL(`${B}/campaigns/${id}`, { waitUntil: "commit" });
await page.getByRole("heading", { name: "Pune dental clinics 2026" }).waitFor(); step("edit saved");
await page.goto(B + "/campaigns"); await shot("07-campaigns");

await page.goto(B + "/settings/integrations");
await page.fill("#hunter-api_key", "hk_live_abcdef987654");
await page.locator("article", { hasText: "Hunter" }).getByRole("button", { name: /^(Save|Update)$/ }).click();
await page.getByText("Hunter saved").waitFor();
await page.reload(); await page.getByText("Saved, not yet checked").waitFor();
const html = await page.content();
if (html.includes("abcdef987654")) throw new Error("secret leaked to page");
if (!html.includes("••••7654")) throw new Error("mask missing");
await shot("08-integrations"); step("integration encrypted and masked");

await page.goto(B + "/settings/team");
await page.fill("[aria-label='Email to invite']", `new.${Date.now()}@demo.local`); await page.click("button:has-text('Send invite')");
await page.getByText(/Invite sent to new|Invite saved/).waitFor(); await page.getByText("Pending invites").waitFor();
await shot("09-team"); step("invite");

await page.goto(B + "/settings"); await page.fill("#company_website", "ftp://demo.example");
await page.fill("#sender_name", "Asha");
await page.click("button:has-text('Save settings')"); await page.getByText("Use a full URL").waitFor();
if ((await page.inputValue("#sender_name")) !== "Asha") throw new Error("form reset on error");
await page.fill("#company_website", "https://demo.example"); await page.click("button:has-text('Save settings')"); await page.getByText("Settings saved.").waitFor();
await shot("10-settings"); step("settings validation + save");

await page.goto(B + "/audit"); await page.getByText("campaigns.insert").first().waitFor(); await page.getByText(/integrations\.(insert|update)/).first().waitFor();
await shot("11-audit"); step("audit log");
await page.goto(B + "/usage"); await shot("12-usage");
await page.goto(B + "/modules/domains"); await page.getByText("Arrives in Phase 2").waitFor(); step("locked module");

await page.setViewportSize({ width: 390, height: 844 }); await page.goto(B + `/campaigns/${id}`); await shot("13-mobile-detail");
await page.click("[aria-label='Open menu']"); await shot("14-mobile-menu");
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
if (overflow) throw new Error("horizontal overflow on mobile"); step("mobile layout");
await page.setViewportSize({ width: 1360, height: 900 });
await page.goto(`${B}/campaigns/${id}`);
page.once("dialog", (d) => d.accept());
await page.click("button:has-text('Delete campaign')"); await page.waitForURL(/deleted=1/, { waitUntil: "commit" }); step("delete");
await page.click("button:has-text('Sign out')"); await page.waitForURL(/\/login/, { waitUntil: "commit" }); step("sign out");
console.log("errors:", errors);
if (errors.length) process.exitCode = 1;
await browser.close();
