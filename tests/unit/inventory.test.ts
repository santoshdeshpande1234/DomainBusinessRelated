import { describe, expect, it } from "vitest";
import { classify, discoverLinks, extractBrand, extractPage, missingInfo, parseSitemap, pickPages, readProblem, robotsRules, allowed, sameSite, type Inventory, type PageRecord } from "@/lib/studio/inventory";
import { buildBlueprint } from "@/lib/studio/blueprint";
import { buildPlan } from "@/lib/studio/growth";
import { compose } from "@/lib/studio/compose";
import { validateSite } from "@/lib/studio/site";
import { qualityGate } from "@/lib/studio/quality";
import { FIXTURE_KEYS, fixtureSite } from "@/lib/studio/fixtures";
import { contrast, defaultDirection, derivePalette, DIRECTION_KEYS, resolveDirection } from "@/lib/studio/design";
import type { Audit } from "@/lib/discovery/prospects";

const B = "https://smile.example/";
const HOME = `<html><head><title>Smile Studio | Dentist in Pune</title><meta name="description" content="Family dental care on FC Road.">
<meta name="theme-color" content="#0b6e78"><style>.btn{background:#0b6e78;color:#fff}.x{color:#0b6e78}</style></head><body>
<header><img class="site-logo" src="/img/logo.png"><nav><a href="/">Home</a><a href="/about-us/">About us</a><a href="/services">Services</a>
<a href="/services/dental-implants">Dental implants</a><a href="/services/braces?utm_source=x">Braces</a><a href="/contact">Contact</a><a href="https://other.example/x">Partner</a>
<a href="/wp-admin/">Admin</a><a href="/brochure.pdf">Brochure</a></nav></header>
<main><h1>Gentle dental care in Pune</h1><p>We look after families across Pune with check-ups, implants and braces, all under one roof.</p>
<p>Award-winning team trusted by 5000+ patients. Book online or call us today to arrange a visit at a time that suits you.</p>
<div class="cookie-banner"><p>We use cookies to improve your experience on this website, accept all to continue.</p></div>
<blockquote>Dr Rao made my visit painless and quick, highly recommended!</blockquote></main>
<footer><p>© 2025 Smile Studio. All rights reserved and more footer text here.</p></footer></body></html>`;

const page = (o: Partial<PageRecord> & { url: string; kind: PageRecord["kind"] }): PageRecord => ({
  status: "extracted", note: null, title: null, description: null, h1: null, headings: [], paragraphs: [], items: [], prices: [], faqs: [], claims: [],
  forms: 0, booking: false, phones: [], emails: [], ...o,
});

describe("reading their website", () => {
  it("normalises same-site links and skips assets, admin pages and other sites", () => {
    expect(sameSite("/services/braces?utm_source=x#top", B)).toBe("https://smile.example/services/braces");
    expect(sameSite("https://www.smile.example/about/", B)).toBe("https://smile.example/about");
    expect(sameSite("/wp-admin/", B)).toBeNull();
    expect(sameSite("/brochure.pdf", B)).toBeNull();
    expect(sameSite("https://other.example/x", B)).toBeNull();
    expect(sameSite("mailto:a@b.c", B)).toBeNull();
    const links = discoverLinks(HOME, B);
    expect(links.filter((l) => l.nav).map((l) => l.url)).toEqual([
      "https://smile.example/", "https://smile.example/about-us", "https://smile.example/services",
      "https://smile.example/services/dental-implants", "https://smile.example/services/braces", "https://smile.example/contact",
    ]);
  });

  it("uses the sitemap and robots.txt, navigation first, within the page budget", () => {
    expect(parseSitemap("<urlset><url><loc>https://smile.example/blog/tips</loc></url><url><loc>https://smile.example/faq</loc></url></urlset>", B).urls)
      .toEqual(["https://smile.example/blog/tips", "https://smile.example/faq"]);
    expect(parseSitemap("<sitemapindex><sitemap><loc>https://smile.example/page-sitemap.xml</loc></sitemap></sitemapindex>", B).nested).toEqual(["https://smile.example/page-sitemap.xml"]);
    const dis = robotsRules("User-agent: Googlebot\nDisallow: /g\n\nUser-agent: *\nDisallow: /private\nSitemap: https://smile.example/sitemap.xml");
    expect(dis).toEqual([{ allow: false, path: "/private" }]);
    const picked = pickPages("https://smile.example/", discoverLinks(HOME, B), ["https://smile.example/faq", "https://smile.example/private/x", "https://smile.example/privacy-policy", "https://smile.example/blog/tips"], dis, 6);
    expect(picked).toEqual(["https://smile.example/about-us", "https://smile.example/services", "https://smile.example/services/dental-implants", "https://smile.example/services/braces", "https://smile.example/contact"]);
  });

  it("reads robots.txt wildcards and Allow rules as crawlers do", () => {
    // A HubSpot-style file: preview URLs are blocked, the rest of the site is not.
    const r = robotsRules("User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nAllow: /\nDisallow: /tag/\nDisallow: /*?hs_preview\nDisallow: /*hsCacheBuster\nDisallow: /*.pdf$");
    expect(r.some((x) => x.path === "/" && !x.allow)).toBe(false);
    expect(allowed("https://x.example/about", r)).toBe(true);
    expect(allowed("https://x.example/services/it-staffing", r)).toBe(true);
    expect(allowed("https://x.example/tag/news", r)).toBe(false);
    expect(allowed("https://x.example/about?hs_preview=1", r)).toBe(false);
    expect(allowed("https://x.example/a?x=1&hsCacheBuster=2", r)).toBe(false);
    expect(allowed("https://x.example/brochure.pdf", r)).toBe(false);
    expect(allowed("https://x.example/pdf-guide", r)).toBe(true);
    // Longest match wins; Allow wins a tie.
    const r2 = robotsRules("User-agent: *\nDisallow: /private\nAllow: /private/open");
    expect(allowed("https://x.example/private/open/page", r2)).toBe(true);
    expect(allowed("https://x.example/private/x", r2)).toBe(false);
    // Agents listed together share the group; a later group starts fresh.
    expect(robotsRules("User-agent: Googlebot\nUser-agent: *\nDisallow: /x\nUser-agent: Bingbot\nDisallow: /y")).toEqual([{ allow: false, path: "/x" }]);
  });

  it("reads the real home page first when the listed address is deep inside the site", () => {
    const links = [{ url: "https://x.example/services", nav: true }, { url: "https://x.example/about", nav: true }];
    expect(pickPages("https://x.example/about/locations/new-york", links, [], [], 6)).toEqual(["https://x.example/", "https://x.example/services", "https://x.example/about"]);
    expect(classify("https://x.example/about/locations/new-york", null)).not.toBe("home");
  });

  it("flags a read that couldn't follow the site's links, not information the site doesn't publish", () => {
    const base = inventory();
    expect(readProblem(base)).toBeNull();
    expect(readProblem({ ...base, pages: base.pages.slice(0, 1), discovered: 81 })).toMatch(/Only the first page could be read of 81/);
    expect(readProblem({ ...base, pages: base.pages.map((p, i) => i > 3 ? { ...p, status: "failed" as const } : p) })).toMatch(/5 of 9 pages could not be loaded/);
    expect(readProblem({ ...base, queue: ["https://smile.example/x"], pages: base.pages.slice(0, 1) })).toBeNull();
  });

  it("classifies pages by their address", () => {
    expect(classify("https://x.in/about-us", null)).toBe("about");
    expect(classify("https://x.in/services", null)).toBe("services");
    expect(classify("https://x.in/services/braces", null)).toBe("service");
    expect(classify("https://x.in/blog/2024/tips", null)).toBe("article");
    expect(classify("https://x.in/privacy-policy", null)).toBe("legal");
    expect(classify("https://x.in/root-canal", null)).toBe("service");
  });

  it("extracts readable content and sets trust claims aside", () => {
    const p = extractPage(HOME, B, "home");
    expect(p.h1).toBe("Gentle dental care in Pune");
    expect(p.paragraphs[0]).toMatch(/^We look after families/);
    // The claim sentence is set aside; the rest of its paragraph is kept.
    expect(p.paragraphs.join(" ")).not.toMatch(/Award|5000/);
    expect(p.paragraphs.join(" ")).toMatch(/Book online or call us today/);
    expect(p.claims.join(" ")).toMatch(/Award-winning/);
    expect(p.claims.join(" ")).toMatch(/Dr Rao/);
    expect(p.paragraphs.join(" ")).not.toMatch(/cookies|All rights reserved/);
    const faq = extractPage(`<main><h3>Do you treat children?</h3><p>Yes, from age three.</p><details><summary>Is parking available?</summary><p>Street parking only.</p></details><p>Implant consultation ₹ 1,500 including the scan.</p></main>`, B, "faq");
    expect(faq.faqs.map((f) => f.q)).toEqual(["Is parking available?", "Do you treat children?"]);
    expect(faq.prices).toEqual(["Implant consultation ₹ 1,500 including the scan."]);
  });

  it("finds the logo and brand colour from their own markup", () => {
    expect(extractBrand(HOME, B)).toMatchObject({ logo: "https://smile.example/img/logo.png", accent: "#0b6e78", colorsFrom: "theme-color tag" });
    expect(extractBrand("<p>plain</p>", B)).toMatchObject({ logo: null, accent: null });
  });
});

const audit = (o: Partial<Audit> = {}): Audit => ({
  url: "", final_url: B, status: 200, https: true, ms: 800, kb: 50, title: "x", description: null, viewport: true, h1: 1,
  forms: 0, booking: false, cta: [], tel: true, emails: [], schema: false, copyright_year: 2025, generator: null, pricing: false,
  nav: [], headings: [], analytics: false, chat: false, ...o,
});
const inventory = (): Inventory => ({
  root: "https://smile.example", crawled_at: "2026-10-22T00:00:00Z", brand: { logo: "https://smile.example/img/logo.png", accent: "#0b6e78", ink: null, colorsFrom: "theme-color tag" },
  sitemap: true, robots: true, queue: [], discovered: 9,
  pages: [
    page({ url: "https://smile.example/", kind: "home", h1: "Gentle dental care in Pune", paragraphs: ["We look after families across Pune with check-ups, implants and braces."], claims: ["Award-winning team"] }),
    page({ url: "https://smile.example/about-us", kind: "about", title: "About us | Smile Studio", paragraphs: ["Dr Rao opened Smile Studio on FC Road in 2009 to offer calm, unhurried dental care."] }),
    page({ url: "https://smile.example/services/dental-implants", kind: "service", h1: "Dental implants", paragraphs: ["Implants replace missing teeth with a fixed, natural-looking tooth."], prices: ["Implant consultation ₹ 1,500 including the scan."] }),
    page({ url: "https://smile.example/services/braces", kind: "service", title: "Braces – Smile Studio", paragraphs: ["Metal and clear braces for teens and adults. Better than Bright Teeth Clinic."], items: ["Metal braces", "Clear aligners", "Retainers"] }),
    page({ url: "https://smile.example/contact", kind: "contact", h1: "Contact us", paragraphs: ["Visit us at 1 FC Road, Pune, or call to arrange an appointment."], forms: 1 }),
    page({ url: "https://smile.example/blog/brushing-tips", kind: "article", title: "Five brushing tips", description: "How to brush properly." }),
    page({ url: "https://smile.example/testimonials", kind: "testimonials", title: "Reviews", paragraphs: ["Patients say lovely things about our team and their visits."] }),
    page({ url: "https://smile.example/careers", kind: "careers", title: "Careers", paragraphs: ["We are hiring a dental assistant to join our friendly team."] }),
    page({ url: "https://smile.example/gallery-old", kind: "other", status: "failed", note: "HTTP 500" }),
  ],
});
const facts = { name: "Smile Studio", industry: "healthcare", primaryCta: "Book an appointment", booking: true, hasPhone: true };
const plan = () => buildPlan({ name: "Smile Studio", industry: "healthcare", industryLabel: "Healthcare", category: "Dentist", city: "Pune", website: B, audit: audit(),
  phone: "+91 20 1111 2222", email: null, address: "1 FC Road, Pune", reviews: null, services: [], competitors: [] }, { now: new Date("2026-10-22T00:00:00Z") });

describe("blueprint", () => {
  it("gives every original page an outcome with a reason", () => {
    const bp = buildBlueprint(inventory(), plan(), facts, ["Bright Teeth Clinic"]);
    const by = (path: string) => bp.originals.find((o) => o.url.endsWith(path))!;
    expect(bp.originals).toHaveLength(9);
    expect(by("/")).toMatchObject({ action: "improved", target: "home" });
    expect(by("/about-us")).toMatchObject({ action: "improved", target: "about" });
    expect(by("/services/dental-implants")).toMatchObject({ action: "improved", target: "service-dental-implants" });
    expect(by("/blog/brushing-tips")).toMatchObject({ action: "improved", target: "article-five-brushing-tips" });
    // No customer quotes on their testimonials page, so nothing is copied or invented.
    expect(by("/testimonials")).toMatchObject({ action: "excluded" });
    expect(by("/careers")).toMatchObject({ action: "preserved", target: "careers" });
    expect(by("/gallery-old")).toMatchObject({ action: "excluded" });
    expect(bp.originals.every((o) => o.reason.length > 0)).toBe(true);
  });

  it("builds multi-page content from their own pages, without other businesses or unconfirmed claims", () => {
    const bp = buildBlueprint(inventory(), plan(), facts, ["Bright Teeth Clinic"]);
    expect(bp.pages.map((p) => p.slug)).toEqual(expect.arrayContaining(["home", "services", "about", "book", "faq", "resources", "contact", "service-dental-implants", "service-braces"]));
    expect(bp.services.map((s) => s.title)).toEqual(["Dental implants", "Braces"]);
    const json = JSON.stringify(bp.pages);
    expect(json).toMatch(/Dr Rao opened Smile Studio/);
    expect(json).toMatch(/Implant consultation ₹ 1,500/);
    expect(json).not.toMatch(/Bright Teeth|Award-winning|"testimonials"/);
    // Their careers page is kept on-site, out of the main menu, and articles become pages of this site.
    expect(bp.pages.find((p) => p.slug === "careers")).toMatchObject({ nav: null });
    expect(json).toMatch(/We are hiring a dental assistant/);
    expect(bp.pages.find((p) => p.slug === "resources")!.sections[0]).toMatchObject({ type: "articles", items: [{ slug: "article-five-brushing-tips" }] });
    const slugs = new Set(bp.pages.map((p) => p.slug));
    for (const p of bp.pages) for (const s of p.sections) if (s.type === "cta") {
      expect(slugs.has(s.target!)).toBe(true);
      if (s.secondary) expect(slugs.has(s.secondary.target)).toBe(true);
    }
    expect(bp.review.join(" ")).toMatch(/mention another business/);
    expect(bp.review.join(" ")).toMatch(/Trust claim .*Award-winning/);
  });

  it("maps every saved plan recommendation to a page and flags conflicts for review", () => {
    const p = plan();
    const bp = buildBlueprint(inventory(), p, facts);
    expect(bp.features.map((f) => f.key).sort()).toEqual(p.gaps.map((g) => g.key).sort());
    const f = (k: string) => bp.features.find((x) => x.key === k)!;
    // The home page had no form, but the contact page does: flagged, not silently "fixed".
    expect(f("form")).toMatchObject({ status: "review", page: "contact + every service page" });
    expect(f("booking")).toMatchObject({ page: "book", status: "simulated" });
    expect(f("answers").status).toBe("simulated");
    expect(f("tracking").status).toBe("proposed");
    expect(f("discovery")).toMatchObject({ status: "review" });
  });

  it("still works when the website couldn't be read", () => {
    const bp = buildBlueprint(null, plan(), facts);
    expect(bp.originals).toEqual([]);
    expect(bp.missing[0]).toMatch(/hasn't been read/);
    expect(bp.pages.map((p) => p.slug)).toEqual(expect.arrayContaining(["home", "contact", "faq"]));
  });
});

describe("generation with the inventory and the saved plan", () => {
  const input = () => ({
    facts: { id: "p1", name: "Smile Studio", category: "Dentist", city: "Pune", industry: "healthcare", industryLabel: "Healthcare", phone: "+91 20 1111 2222",
      email: null, address: "1 FC Road, Pune", maps_url: null, website: B, audit: audit() },
    reviews: null, competitors: [], others: ["Bright Teeth Clinic"], mode: "site" as const, inventory: inventory(), now: new Date("2026-10-22T00:00:00Z"),
  });

  it("uses their services, story and brand, and validates", () => {
    const r = compose(input());
    if (!r.ok) throw new Error(r.error);
    expect(r.content.services.map((s) => [s.title, s.slug])).toEqual([["Dental implants", "service-dental-implants"], ["Braces", "service-braces"]]);
    expect(r.content.about).toMatch(/^Dr Rao opened/);
    expect(r.content.brand).toMatchObject({ logo: "https://smile.example/img/logo.png", colors: { accent: "#0b6e78" } });
    expect(r.stages.find((s) => s.key === "blueprint")!.note).toMatch(/9 original page\(s\)/);
    // Notes for the team (a trust claim left out, another business named) don't make the blueprint a partial result.
    expect(r.blueprint.review.length).toBeGreaterThan(0);
    expect(r.stages.find((s) => s.key === "blueprint")).toMatchObject({ status: "done", note: expect.stringMatching(/note\(s\) to review in the studio/) });
    // A website that hasn't been read page by page does.
    const unread = compose({ ...input(), inventory: null });
    if (!unread.ok) throw new Error(unread.error);
    expect(unread.stages.find((s) => s.key === "blueprint")!.status).toBe("partial");
    expect(validateSite(r.content, ["Bright Teeth Clinic"])).toEqual([]);
  });

  it("treats the saved Growth Plan as the source of truth on rebuild", () => {
    const saved = { ...plan(), built_at: "2026-10-01T00:00:00.000Z" };
    saved.gaps = saved.gaps.filter((g) => g.key !== "tracking");
    const r = compose({ ...input(), savedPlan: saved });
    if (!r.ok) throw new Error(r.error);
    expect(r.plan).toBe(saved);
    expect(r.blueprint.features.some((f) => f.key === "tracking")).toBe(false);
    expect(r.stages.find((s) => s.key === "gaps")!.note).toMatch(/Saved Growth Plan from 2026-10-01/);
    // Refreshing the plan on purpose regenerates it.
    const fresh = compose({ ...input(), savedPlan: saved, mode: "plan", existing: r.content });
    if (!fresh.ok) throw new Error(fresh.error);
    expect(fresh.plan).not.toBe(saved);
  });

  it("reports what the inventory couldn't find", () => {
    expect(missingInfo(inventory())).toEqual(["FAQs", "Contact details on the website", "1 page(s) could not be loaded"]);
  });
});

describe("social profiles, imagery and quotes", () => {
  it("keeps official profiles and the share image, never share buttons", () => {
    const html = `<head><meta property="og:image" content="/img/hero.jpg"></head><body>
      <a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a><a href="https://www.facebook.com/smilestudio/">Facebook</a>
      <a href="https://instagram.com/p/abc">Post</a><a href="https://www.instagram.com/smilestudio">Instagram</a>
      <a href="https://twitter.com/intent/tweet?text=x">Tweet</a><a href="https://www.linkedin.com/company/smile-studio">LinkedIn</a></body>`;
    const b = extractBrand(html, B);
    expect(b.image).toBe("https://smile.example/img/hero.jpg");
    expect(b.social).toEqual([
      { network: "facebook", url: "https://www.facebook.com/smilestudio" },
      { network: "instagram", url: "https://www.instagram.com/smilestudio" },
      { network: "linkedin", url: "https://www.linkedin.com/company/smile-studio" },
    ]);
  });

  it("captures customer quotes word for word, only from quotes", () => {
    const p = extractPage(`<main><h1>Reviews</h1><p>"The team explained everything and the implant feels natural."</p><p>Patients say lovely things.</p></main>`, B + "testimonials", "testimonials");
    expect(p.quotes).toEqual(['"The team explained everything and the implant feels natural."']);
    expect(extractPage(HOME, B, "home").quotes).toEqual(["Dr Rao made my visit painless and quick, highly recommended!"]);
  });

  it("puts quotes on a testimonials page and the home page, each credited to its source", () => {
    const inv = inventory();
    inv.pages = inv.pages.map((p) => p.kind === "testimonials" ? { ...p, quotes: ["“Gentle, quick and clear about every cost.” – Priya"] } : p);
    const bp = buildBlueprint(inv, plan(), facts);
    expect(bp.originals.find((o) => o.url.endsWith("/testimonials"))).toMatchObject({ action: "improved", target: "testimonials" });
    const proof = bp.pages.find((p) => p.slug === "testimonials")!.sections.find((s) => s.type === "proof");
    expect(proof).toMatchObject({ kind: "quotes", attributed: [{ text: "“Gentle, quick and clear about every cost.” – Priya", source: "https://smile.example/testimonials" }] });
    expect(bp.review.join(" ")).toMatch(/word for word/);
  });

  it("shows only specific, published credentials, never vague or numeric claims", () => {
    const inv = inventory();
    inv.pages[0] = { ...inv.pages[0], claims: ["Award-winning team", "Trusted by 5000+ patients", "Registered with the Maharashtra State Dental Council"] };
    const bp = buildBlueprint(inv, plan(), facts);
    const about = bp.pages.find((p) => p.slug === "about")!.sections.find((s) => s.type === "proof");
    expect(about).toMatchObject({ kind: "credentials", attributed: [{ text: "Registered with the Maharashtra State Dental Council", source: B }] });
  });
});

describe("hero and quality gate", () => {
  const input = () => ({
    facts: { id: "p1", name: "Smile Studio", category: "Dentist", city: "Pune", industry: "healthcare", industryLabel: "Healthcare", phone: "+91 20 1111 2222",
      email: null, address: "1 FC Road, Pune", maps_url: null, website: B, audit: audit() },
    reviews: null, competitors: [], others: ["Bright Teeth Clinic"], mode: "site" as const, inventory: inventory(), now: new Date("2026-10-22T00:00:00Z"),
  });
  const built = () => { const r = compose(input()); if (!r.ok) throw new Error(r.error); return r; };

  it("leads with their own home-page headline", () => {
    expect(built().content.hero.headline).toBe("Gentle dental care in Pune");
  });

  it("passes a complete site and reports browser checks as not run", () => {
    const r = built();
    const q = qualityGate(r.content, { blueprint: r.blueprint, others: ["Bright Teeth Clinic"] });
    const st = (k: string) => q.checks.find((c) => c.key === k)!.status;
    for (const k of ["navigation", "cta", "primary_cta", "interactive", "forms", "contrast", "context"]) expect(st(k), k).toBe("pass");
    expect(st("browser")).toBe("not_run");
    expect(q.ready).toBe(true);
    expect(q.score).toBeGreaterThanOrEqual(80);
    expect(q.summary).toMatch(/1 not run here/);
    expect(r.stages.find((s) => s.key === "validate")!.note).toMatch(/^Quality gate/);
  });

  it("fails a dead call to action, a missing service page and unsourced proof", () => {
    const c = structuredClone(built().content);
    c.pages![0].sections.push({ type: "cta", heading: "Go", text: "x", target: "nowhere" });
    c.services[0].slug = "service-missing";
    c.pages![0].sections.push({ type: "proof", kind: "quotes", attributed: [{ text: "Brilliant", source: "https://elsewhere.example/" }] });
    const q = qualityGate(c);
    const st = (k: string) => q.checks.find((x) => x.key === k)!.status;
    expect([st("cta"), st("interactive"), st("proof")]).toEqual(["fail", "fail", "fail"]);
    expect(q.ready).toBe(false);
    expect(q.score).toBeLessThanOrEqual(59);
  });
});

describe("design system", () => {
  it("uses the brand colour, deepening it when white text wouldn't be readable", () => {
    const p = derivePalette({ brand: "#38bdf8", industry: "healthcare" });
    expect(p.source).toBe("brand");
    expect(contrast(p.tokens.primary, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(p.notes.join(" ")).toMatch(/deepened/);
    expect(p.tokens.secondary).toBe("#38bdf8");
  });
  it("falls back to an industry palette for a grey brand colour, and every pair meets AA", () => {
    for (const industry of ["healthcare", "professional_services", "hospitality", "it", "home_services", "retail", null]) {
      const p = derivePalette({ brand: "#777777", industry });
      expect(p.source).toBe("industry");
      const t = p.tokens;
      expect(contrast(t.primary, t.onPrimary)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.accent, t.onAccent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.body, t.bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(t.muted, t.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.onDark, t.dark)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("maps older theme names to a direction and defaults by industry", () => {
    expect(resolveDirection("atelier")).toEqual({ key: "editorial", legacy: "atelier" });
    expect(resolveDirection("bold")).toEqual({ key: "bold", legacy: null });
    expect(resolveDirection(null, "legal").key).toBe(defaultDirection("legal"));
    expect(DIRECTION_KEYS).toEqual(["corporate", "minimal", "bold", "specialist", "editorial"]);
  });
});

describe("sample businesses across industries", () => {
  it.each(FIXTURE_KEYS)("%s builds and passes every required quality check", (key) => {
    const f = fixtureSite(key)!;
    const q = qualityGate(f.content, { others: ["Bright Teeth Clinic"] });
    expect(q.checks.filter((c) => c.critical && c.status === "fail").map((c) => `${c.key}: ${c.detail}`)).toEqual([]);
    expect(JSON.stringify(f.content)).not.toMatch(/Bright Teeth/);
  });
  it("gives a business that already takes bookings a booking flow", () => {
    const f = fixtureSite("dentist")!;
    expect(f.content.pages!.find((p) => p.slug === "book")!.sections.map((s) => s.type)).toContain("booking");
  });
});
