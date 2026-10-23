// Browser checks for generated websites: every page, link, tab, menu, form and booking step, in every
// design direction, at phone, tablet and desktop widths. Runs against sample businesses built by the real
// pipeline (src/lib/studio/fixtures.ts), so nothing external is called.
//   SITE_FIXTURES=1 npm run dev            (or next start with SITE_FIXTURES=1)
//   E2E_URL=http://localhost:3000 npm run test:e2e:sites
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const B = process.env.E2E_URL ?? "http://localhost:3000";
const SHOTS = process.env.E2E_SHOTS ?? "test-results/sites";
const FIXTURES = { workday: "northwind-hcm.example", dentist: "smile-studio.example", lawfirm: null, plumber: "flowright.example" };
// Drafts that still show [[placeholders]] for the team to fill (the studio blocks "Mark ready" until they are).
const DRAFTS = new Set(["lawfirm"]);
const DIRECTIONS = ["corporate", "minimal", "bold", "specialist", "editorial"];
const WIDTHS = [390, 768, 1280];
const SOCIAL = /^(https:\/\/(www\.)?(facebook|instagram|linkedin|twitter|x|youtube|tiktok|pinterest)\.[a-z.]+\/|https:\/\/(www\.)?google\.[a-z.]+\/maps|https:\/\/maps\.)/;

const failures = [];
const fail = (where, m) => { failures.push(`${where}: ${m}`); console.log("✗", where, m); };
const ok = (m) => console.log("✓", m);
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

async function open(url) {
  errors.length = 0;
  const r = await page.goto(url, { waitUntil: "networkidle" });
  if (!r || r.status() !== 200) throw new Error(`${url} returned ${r?.status()}`);
}

/** Checks every link on the current page; returns the internal pages it links to. */
async function checkLinks(where, base, original) {
  const links = await page.$$eval("a", (as) => as.map((a) => ({ href: a.getAttribute("href"), text: (a.textContent ?? "").trim() || a.getAttribute("aria-label") || "", target: a.target, rel: a.rel })));
  const internal = new Set();
  for (const l of links) {
    if (!l.href || l.href === "#" || l.href.startsWith("javascript:")) { fail(where, `dead link “${l.text}” (${l.href ?? "no href"})`); continue; }
    if (!l.text) fail(where, `link without a name: ${l.href}`);
    if (l.href.startsWith("#")) { if (l.href.length > 1 && !(await page.$(`[id="${l.href.slice(1)}"]`))) fail(where, `anchor ${l.href} has no target`); continue; }
    if (l.href.startsWith("/preview/fixture/")) { internal.add(l.href.split("#")[0]); continue; }
    if (/^(tel|mailto):/.test(l.href)) continue;
    let host = null;
    try { host = new URL(l.href).hostname.replace(/^www\./, ""); } catch { fail(where, `unparseable link ${l.href}`); continue; }
    if (original && host === original) { fail(where, `links back to the original site: ${l.href}`); continue; }
    if (!SOCIAL.test(l.href)) fail(where, `unexpected external link ${l.href}`);
    else if (l.target !== "_blank" || !/noopener/.test(l.rel)) fail(where, `external link without target=_blank rel=noopener: ${l.href}`);
  }
  for (const b of await page.$$eval("button", (bs) => bs.map((x) => (x.textContent ?? "").trim() || x.getAttribute("aria-label") || ""))) if (!b) fail(where, "button without a name");
  return [...internal].filter((h) => h.startsWith(base));
}

async function checkLayout(where) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) fail(where, `horizontal overflow of ${over}px at ${w}px`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

async function checkMobileMenu(where) {
  await page.setViewportSize({ width: 390, height: 844 });
  const btn = page.locator('button[aria-controls="site-mobile-nav"]');
  if (!(await btn.count())) { fail(where, "no mobile menu button"); return; }
  await btn.click();
  const nav = page.locator("#site-mobile-nav");
  if (!(await nav.isVisible()) || (await btn.getAttribute("aria-expanded")) !== "true") fail(where, "mobile menu does not open");
  else if ((await nav.locator("a").count()) < 2) fail(where, "mobile menu has no links");
  await page.keyboard.press("Escape");
  if (await nav.isVisible()) fail(where, "Escape does not close the mobile menu");
  await page.setViewportSize({ width: 1280, height: 900 });
}

async function checkTabs(where) {
  const lists = page.getByRole("tablist");
  for (let i = 0; i < (await lists.count()); i++) {
    const tabs = lists.nth(i).getByRole("tab");
    const n = await tabs.count();
    for (let t = 0; t < n; t++) {
      await tabs.nth(t).click();
      const label = (await tabs.nth(t).textContent()).trim();
      if ((await tabs.nth(t).getAttribute("aria-selected")) !== "true") fail(where, `tab “${label}” does not select`);
      const panel = page.locator(`#${(await tabs.nth(t).getAttribute("aria-controls")).replace(/:/g, "\\:")}`);
      if (!(await panel.textContent()).includes(label)) fail(where, `panel does not show “${label}”`);
      if (!(await panel.getByRole("link", { name: new RegExp(`Ask about ${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).count())) fail(where, `no next step for “${label}”`);
    }
  }
}

async function checkForm(where) {
  const form = page.locator("form").last();
  if (!(await form.count())) return false;
  await form.locator('button[type="submit"]').click();
  if (!(await form.getByText("Enter your name.").count())) fail(where, "empty enquiry shows no validation");
  if (await form.getByText(/did not send anything/).count()) fail(where, "invalid enquiry claims success");
  await form.getByLabel("Your name").fill("Test Visitor");
  await form.getByLabel("Email or phone").fill("not-an-email");
  await form.locator('button[type="submit"]').click();
  if (!(await form.getByText(/doesn't look like an email/).count())) fail(where, "bad email accepted");
  await form.getByLabel("Email or phone").fill("visitor@example.com");
  await form.locator('button[type="submit"]').click();
  const status = form.getByRole("status");
  if (!(await status.count()) || !/did not send anything/.test(await status.textContent())) fail(where, "valid enquiry does not say honestly that nothing was sent");
  if (/(has been sent|we('| wi)ll be in touch|thank you for your (booking|enquiry))/i.test(await page.textContent("body"))) fail(where, "claims a submission succeeded");
  return true;
}

async function checkBooking(where) {
  const flow = page.getByRole("list", { name: "Booking steps" });
  if (!(await flow.count())) return false;
  const radios = page.getByRole("radio");
  if (await radios.count()) await radios.first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  if (!(await page.getByText("Choose a day.").count())) fail(where, "booking accepts no day");
  await page.locator("button[aria-pressed]").first().click();
  await page.getByRole("button", { name: /Afternoon/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  if (!(await page.getByText("Enter your name.").count())) fail(where, "booking accepts no name");
  await page.getByLabel("Your name").fill("Test Visitor");
  await page.getByLabel("Email or phone").fill("+91 98765 43210");
  await page.getByRole("button", { name: "Continue" }).click();
  if (!(await page.getByText("Check your request").count())) { fail(where, "booking review step not reached"); return true; }
  await page.getByRole("button", { name: /Back/ }).click();
  if ((await page.getByLabel("Your name").inputValue()) !== "Test Visitor") fail(where, "Back loses the entered details");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("h3 + div button, dl + button").first().click();
  const s = page.getByRole("status");
  if (!(await s.count()) || !/did not send anything/.test(await s.textContent())) fail(where, "booking does not say honestly that nothing was sent");
  return true;
}

for (const [name, original] of Object.entries(FIXTURES)) {
  const base = `/preview/fixture/${name}`;
  // 1. Every page reachable from the home page, in the business's own direction.
  const seen = new Set(), queue = [base];
  let forms = 0, bookings = 0;
  while (queue.length) {
    const href = queue.shift();
    if (seen.has(href)) continue;
    seen.add(href);
    await open(B + href);
    const where = `${name} ${href.replace(base, "") || "/"}`;
    for (const l of await checkLinks(where, base, original)) if (!seen.has(l) && !l.includes("view=plan")) queue.push(l);
    if (!(await page.locator("h1").count())) fail(where, "no h1");
    if ((await page.locator("h1").count()) > 1) fail(where, "more than one h1");
    if ((!DRAFTS.has(name) && /\[\[/.test(await page.textContent("main"))) || /lorem ipsum/i.test(await page.textContent("main")) || /\b(undefined|NaN|null)\b/.test(await page.textContent("main"))) fail(where, "placeholder or broken text on the page");
    await checkLayout(where);
    await checkTabs(where);
    if (/[?&]page=book/.test(href) && (await checkBooking(where))) bookings++;
    else if (/[?&]page=(contact|quote)/.test(href) && (await checkForm(where))) forms++;
    if (errors.length) fail(where, `console errors: ${errors.join(" | ").slice(0, 300)}`);
  }
  if (!forms) fail(name, "no contact form was exercised");
  if (name === "dentist" && !bookings) fail(name, "a business that takes bookings has no booking flow");
  ok(`${name}: ${seen.size} page(s), ${forms} form(s), ${bookings} booking flow(s)`);

  // 2. Every design direction: home renders, the mobile menu works, nothing overflows.
  for (const d of DIRECTIONS) {
    await open(`${B}${base}?d=${d}`);
    const where = `${name} [${d}]`;
    await checkLinks(where, base, original);
    await checkLayout(where);
    await checkMobileMenu(where);
    for (const w of [390, 1280]) {
      await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
      await page.screenshot({ path: `${SHOTS}/${name}-${d}-${w}.png`, fullPage: w === 1280 });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    if (errors.length) fail(where, `console errors: ${errors.join(" | ").slice(0, 300)}`);
  }
  ok(`${name}: ${DIRECTIONS.length} design direction(s) checked`);
}

// 3. Topic hand-off: "Ask about X" arrives with X selected.
await open(`${B}/preview/fixture/workday`);
const ask = page.getByRole("link", { name: /^Ask about / }).first();
if (await ask.count()) {
  const topic = (await ask.textContent()).replace(/^Ask about /, "").trim();
  await ask.click(); await page.waitForLoadState("networkidle");
  const sel = page.getByLabel("What is it about?");
  if (!(await sel.count()) || (await sel.inputValue()) !== topic) fail("workday topic", `“Ask about ${topic}” did not pre-select the topic`);
  else ok(`topic hand-off: ${topic}`);
} else fail("workday", "no capability explorer on the home page");

await browser.close();
if (failures.length) { console.error(`\n${failures.length} problem(s) found.`); process.exit(1); }
console.log("\nAll website checks passed.");
