// The website quality gate: checks a generated preview before it is called ready. Deterministic checks
// over the stored content run on every generation and in the studio. Browser checks (clicking every
// element, console errors, responsive layout) run in the automated browser suite, not on the server,
// and are reported as "not run here" rather than passed.
import type { Blueprint, Section, SitePage } from "./blueprint";
import { mainTarget } from "./blueprint";
import { contrast, derivePalette } from "./design";
import { gaps, validateSite, type SiteContent } from "./site";

export type CheckStatus = "pass" | "warn" | "fail" | "not_run";
export type Check = { key: string; label: string; status: CheckStatus; detail: string; critical: boolean };
export type Quality = { score: number; ready: boolean; checks: Check[]; summary: string };

const PAGE_ONLY = new Set(["contact", "book", "quote", "faq"]);
const host = (u: string | null | undefined) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : null; } catch { return null; } };

/** Pages for content made before multi-page sites (mirrors the renderer). */
function pagesIn(c: SiteContent): SitePage[] {
  if (c.pages?.length) return c.pages;
  const pg = (slug: string, sections: Section[]): SitePage => ({ slug, title: slug, nav: slug, heading: slug, intro: null, sections, sources: [], isNew: true });
  return [pg("home", []), pg("services", [{ type: "services" }]), pg("about", []), ...(c.faq?.length ? [pg("faq", [])] : []), pg("contact", [{ type: "qualify" }])];
}

export function qualityGate(c: SiteContent, opts: { blueprint?: Blueprint | null; others?: string[] } = {}): Quality {
  const checks: Check[] = [];
  const add = (key: string, label: string, status: CheckStatus, detail: string, critical = false) => checks.push({ key, label, status, detail, critical });
  const pages = pagesIn(c);
  const slugs = new Set(pages.map((p) => p.slug));
  const main = mainTarget([...slugs], c.booking);
  const original = host(c.sources.find((x) => x.label === "Their current website")?.url) ?? host(c.sources.find((x) => x.label === "Pages read from their website")?.url);
  const sections = pages.flatMap((p) => p.sections.map((s) => ({ page: p.slug, s })));

  // 1. Navigation: every page in the menu exists and has something on it.
  const empty = pages.filter((p) => p.slug !== "home" && !p.sections.length && !PAGE_ONLY.has(p.slug) && !(p.slug === "about" && c.about));
  add("navigation", "Every navigation item opens a page with content", empty.length ? "fail" : "pass",
    empty.length ? `Empty page(s): ${empty.map((p) => p.title).join(", ")}` : `${pages.filter((p) => p.nav).length} navigation item(s), all with content.`, true);

  // 2. Calls to action: each has a destination page of this site; the main one has a working flow.
  const ctas = sections.filter((x) => x.s.type === "cta") as { page: string; s: Extract<Section, { type: "cta" }> }[];
  const dead = ctas.filter((x) => x.s.target && !slugs.has(x.s.target));
  const deadSecondary = ctas.filter((x) => x.s.secondary && !slugs.has(x.s.secondary.target));
  add("cta", "Every call to action leads to a real destination", dead.length ? "fail" : deadSecondary.length ? "warn" : "pass",
    dead.length ? `Missing destination(s): ${dead.map((x) => `${x.s.target} (from ${x.page})`).join(", ")}`
      : deadSecondary.length ? `${deadSecondary.length} secondary action(s) are hidden because their page doesn't exist.` : `${ctas.length + 1} call(s) to action, including the header button, all resolve; main action opens “${main}”.`, true);
  add("primary_cta", "The primary call to action has a working flow", c.hero.primary_cta?.trim() ? "pass" : "fail",
    main === "book" ? "Opens the booking request flow (service, day and time window, details, review)." : main === "quote" ? "Opens the guided quote request." : "Opens the contact page with a validated enquiry form.", true);

  // 3. Interactive elements: lists of capabilities become explorers; service cards each have a destination.
  const lists = sections.filter((x) => x.s.type === "list") as { page: string; s: Extract<Section, { type: "list" }> }[];
  const missingDetail = c.services.filter((s) => s.slug && !slugs.has(s.slug));
  add("interactive", "Interactive elements each have an action", missingDetail.length ? "fail" : "pass",
    missingDetail.length ? `Service card(s) point at missing pages: ${missingDetail.map((s) => s.title).join(", ")}`
      : `${c.services.length} service card(s) and ${lists.reduce((n, x) => n + x.s.items.length, 0)} explorable capability item(s), each opening a page or a pre-filled enquiry.`, true);

  // 4. Forms.
  const bookingFlow = slugs.has("book");
  add("forms", "Forms validate and report honestly", slugs.has("contact") ? (c.booking && !bookingFlow ? "warn" : "pass") : "fail",
    slugs.has("contact") ? `Contact form validates name and email or phone${bookingFlow ? "; booking flow validates day, time and details" : ""}. Submissions in a preview say clearly that nothing was sent.${c.booking && !bookingFlow ? " This business takes bookings but no booking page was generated; the enquiry form is used instead." : ""}`
      : "No contact page.", true);

  // 5. No unnecessary redirection to the original website.
  const oldLinks = sections.filter((x) => x.s.type === "links").length;
  const socialToOld = (c.brand.social ?? []).filter((x) => host(x.url) === original);
  add("self_contained", "Visitors stay on the proposed website", oldLinks || socialToOld.length ? "warn" : "pass",
    oldLinks ? `${oldLinks} older resource list(s) without pages; regenerate to recreate the articles as pages.` : `Internal navigation stays on this site. External links only go to ${[(c.brand.social?.length ? "their official social profiles" : null), (c.contact.maps_url ? "a map" : null), "phone and email"].filter(Boolean).join(", ")}.`);

  // 6. Accuracy: no placeholders left, no unsupported claims, no other business named.
  const problems = validateSite(c, opts.others ?? []);
  const ph = gaps(c);
  add("accuracy", "Business facts are accurate and nothing is invented", problems.some((p) => p.startsWith("Mentions another business")) ? "fail" : problems.length || ph.length ? "warn" : "pass",
    [...problems, ph.length ? `${ph.length} placeholder(s) to fill in` : ""].filter(Boolean).join("; ") || "No placeholders, unsupported claims or other businesses.", true);

  // 7. Social proof is attributed.
  const proof = sections.filter((x) => x.s.type === "proof").flatMap((x) => (x.s as Extract<Section, { type: "proof" }>).attributed);
  const unsourced = proof.filter((x) => !x.source || (original && host(x.source) !== original));
  add("proof", "Social proof is quoted with its source", unsourced.length ? "fail" : proof.length ? "pass" : "warn",
    unsourced.length ? `${unsourced.length} item(s) without a source on their own site.` : proof.length ? `${proof.length} quote(s) or credential(s), each credited to the page it came from.` : "No testimonials or credentials were found on their site; none were invented.");

  // 8. Growth Plan: every recommendation is placed.
  const bp = opts.blueprint;
  if (bp) {
    const unplaced = bp.features.filter((f) => f.page !== "—" && f.page !== "site-wide" && !f.page.split(/\s*\+\s*|,\s*/).some((p) => slugs.has(p) || /every|service pages|home/.test(p)));
    const review = bp.features.filter((f) => f.status === "review").length;
    add("growth", "Growth Plan recommendations are built where they belong", unplaced.length ? "fail" : review ? "warn" : "pass",
      unplaced.length ? `Not placed: ${unplaced.map((f) => f.recommendation).join("; ")}` : `${bp.features.length} recommendation(s): ${bp.features.filter((f) => f.status === "implemented").length} built, ${bp.features.filter((f) => f.status === "simulated").length} simulated, ${bp.features.filter((f) => f.status === "proposed").length} proposed${review ? `, ${review} to review` : ""}.`);
    // 9. Business context kept.
    const read = bp.originals.filter((o) => o.extraction === "extracted" && !["legal", "account"].includes(o.kind));
    const lost = read.filter((o) => o.action === "excluded");
    add("context", "The original site's business context is kept", !bp.originals.length ? "warn" : lost.length / Math.max(1, read.length) > 0.3 ? "fail" : "pass",
      !bp.originals.length ? "Their website hasn't been read page by page yet." : `${read.length - lost.length} of ${read.length} readable original page(s) kept, improved or merged.${lost.length ? ` Excluded: ${lost.map((o) => o.title).join(", ")}.` : ""}`, true);
  }

  // 10. Colour and contrast.
  const t = derivePalette({ brand: c.brand.colors?.accent, ink: c.brand.colors?.ink, industry: c.industry }).tokens;
  const ok = contrast(t.primary, t.onPrimary) >= 4.5 && contrast(t.body, t.bg) >= 7 && contrast(t.muted, t.bg) >= 4.5 && contrast(t.accent, t.onAccent) >= 4.5;
  add("contrast", "Text and buttons meet WCAG AA contrast", ok ? "pass" : "fail", ok ? "Buttons, body text and secondary text all meet AA against their backgrounds." : "A colour pair is below AA.", true);

  // Browser checks: real clicks, console errors and responsive layout run in the automated suite.
  add("browser", "Clicks, console errors and responsive layout (browser)", "not_run", "Runs in the automated browser suite (npm run test:e2e:sites) across desktop, tablet and mobile; not run on the server.");

  const scored = checks.filter((x) => x.status !== "not_run");
  const raw = scored.reduce((n, x) => n + (x.status === "pass" ? 1 : x.status === "warn" ? 0.5 : 0), 0) / Math.max(1, scored.length);
  const failedCritical = checks.some((x) => x.critical && x.status === "fail");
  const score = Math.round(Math.min(raw * 100, failedCritical ? 59 : 100));
  const fails = checks.filter((x) => x.status === "fail").length, warns = checks.filter((x) => x.status === "warn").length;
  return { score, ready: !failedCritical && fails === 0, checks,
    summary: `${score}/100: ${scored.length - fails - warns} passed, ${warns} to check, ${fails} failed, ${checks.length - scored.length} not run here.` };
}
