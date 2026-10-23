// Renders a website preview from stored content, in the design direction and palette for this
// business. All text is rendered as React text (escaped), and placeholders are highlighted so an
// unfinished draft is obvious. Two views: the proposed website, and the client-facing growth plan.
import { PLACEHOLDER, jsonLd, type SiteContent } from "@/lib/studio/site";
import type { SitePage } from "@/lib/studio/blueprint";
import { mainTarget } from "@/lib/studio/blueprint";
import { DIRECTIONS, cssVars, derivePalette, resolveDirection } from "@/lib/studio/design";
import { Assistant, ServiceFinder } from "@/components/preview-demos";
import { GrowthPlanView } from "@/components/growth-plan";
import { BTN, H2, PageView, PrimaryCta, Sections, ServiceCards, finderOptions, type Site } from "@/components/site-pages";
import { EnquiryForm, SafeImg, SiteNav } from "@/components/site-interactive";
import { Alt } from "@/components/site-pages";

function T({ children }: { children: string }) {
  if (!PLACEHOLDER.test(children)) return <>{children}</>;
  return <>{children.split(/(\[\[[^\]]*\]\])/).map((part, i) => PLACEHOLDER.test(part)
    ? <mark key={i} className="rounded bg-amber-200 px-1 text-amber-950">{part.slice(2, -2)}</mark> : part)}</>;
}

/** Pages for previews made before multi-page sites: the same content, split the same way. */
export function pagesOf(c: SiteContent): SitePage[] {
  if (c.pages?.length) return c.pages;
  const pg = (slug: string, title: string, sections: SitePage["sections"]): SitePage => ({ slug, title, nav: title, heading: slug === "about" ? `About ${c.brand.name}` : title, intro: null, sections, sources: [], isNew: true });
  return [
    pg("home", "Home", []),
    pg("services", "Services", [{ type: "services" }, { type: "finder" }]),
    pg("about", "About", [{ type: "text", paragraphs: [c.about] }]),
    ...(c.faq?.length ? [pg("faq", "FAQ", [])] : []),
    pg("contact", "Contact", [{ type: "qualify" }, { type: "contact" }]),
  ];
}

const SOCIAL_LABEL: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", x: "X (Twitter)", youtube: "YouTube", tiktok: "TikTok", pinterest: "Pinterest" };

export function SitePreview({ content: c, theme, layout, domain, owner, year, view = "site", links, page, pageHref }: {
  content: SiteContent; theme: string; layout: string; domain: string | null; owner: string; year: number;
  view?: "site" | "plan"; links?: { site: string; plan: string };
  page?: string | null; pageHref?: (slug: string) => string;
}) {
  const { key, legacy } = resolveDirection(theme, c.industry);
  const d = DIRECTIONS[key];
  const palette = derivePalette({ brand: c.brand.colors?.accent, ink: c.brand.colors?.ink, industry: c.industry, legacyTheme: legacy });
  const vars = { ...cssVars(palette.tokens, d), fontFamily: "var(--font-body)" } as React.CSSProperties;
  const pages = pagesOf(c);
  const slugs = new Set(pages.map((p) => p.slug));
  const base = (slug: string) => (pageHref ? pageHref(slug) : slug === "home" ? "?" : `?page=${slug}`);
  const href = (slug: string, topic?: string) => { const u = base(slugs.has(slug) ? slug : "home"); return topic ? `${u}${u.includes("?") ? "&" : "?"}topic=${encodeURIComponent(topic.slice(0, 80))}` : u; };
  const tel = c.contact.phone ? `tel:${c.contact.phone.replace(/[^\d+]/g, "")}` : null;
  const s: Site = { c, href, tel, main: mainTarget([...slugs], c.booking), slugs };
  const current = page && page !== "home" ? pages.find((p) => p.slug === page) ?? null : null;
  const home = pages.find((p) => p.slug === "home");
  const nav = pages.filter((p) => p.nav && p.slug !== "home" && (p.slug !== s.main || p.slug === "contact")).map((p) => ({ slug: p.slug, label: p.nav!, href: href(p.slug) }));
  const footerExtra = pages.filter((p) => !p.nav && ["careers", "testimonials", "stories", "quote"].includes(p.slug));
  const plan = view === "plan" && c.growth;
  const darkHeader = d.header === "dark";

  return (
    <div style={vars} className="min-h-screen bg-[color:var(--bg)] text-[color:var(--ink)] antialiased [color-scheme:light]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(c, domain ? `https://${domain}` : null)).replace(/</g, "\\u003c") }} />
      <div role="note" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 bg-neutral-900 px-4 py-2 text-center text-xs text-neutral-100 print:hidden">
        <span>Website concept for {c.brand.name}, prepared by {owner}. Not the business&apos;s live website{domain ? `; ${domain} is a proposed domain, not yet owned` : ""}.</span>
        {c.growth && links && (
          <nav aria-label="Preview pages" className="flex gap-1 rounded-full bg-neutral-800 p-0.5">
            <a href={links.site} aria-current={plan ? undefined : "page"} className={`rounded-full px-3 py-1 ${plan ? "" : "bg-white text-neutral-900"}`}>Proposed website</a>
            <a href={links.plan} aria-current={plan ? "page" : undefined} className={`rounded-full px-3 py-1 ${plan ? "bg-white text-neutral-900" : ""}`}>Growth plan</a>
          </nav>
        )}
      </div>
      {plan ? <GrowthPlanView c={c} owner={owner} siteHref={links?.site ?? "?"} /> : <>
        <a href="#top" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-14 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
        <header className={`sticky top-0 z-40 border-b ${darkHeader ? "border-white/10 bg-[color:var(--dark)] text-white" : "border-[color:var(--line)] bg-white/95 backdrop-blur"}`}>
          <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
            <a href={href("home")} className="flex min-w-0 items-center gap-3 text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>
              {c.brand.logo && <span className={darkHeader ? "rounded bg-white p-1" : ""}><SafeImg src={c.brand.logo} alt="" className="h-8 w-auto max-w-[120px] object-contain" /></span>}
              <span className="truncate">{c.brand.name}</span>
            </a>
            <SiteNav items={nav} current={page ?? "home"} cta={{ label: c.hero.primary_cta, href: href(s.main) }} tel={tel} telLabel={c.contact.phone} dark={darkHeader} />
          </div>
        </header>

        {current ? <PageView s={s} p={current} /> : <Home s={s} home={home} hero={d.hero === "split" && layout === "centered" ? "centered" : d.hero} />}

        <footer className="border-t border-[color:var(--line)] bg-[color:var(--surface)]">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)" }}>{c.brand.name}</p>
              {c.contact.address && <p className="mt-2 text-[color:var(--body)]">{c.contact.address}</p>}
            </div>
            <nav aria-label="Footer" className="grid content-start gap-2 text-[color:var(--body)]">
              <p className="font-semibold text-[color:var(--ink)]">Explore</p>
              {[...pages.filter((p) => p.nav && p.slug !== "home"), ...footerExtra].map((p) => <a key={p.slug} href={href(p.slug)} className="hover:text-[color:var(--primary)]">{p.nav ?? p.title}</a>)}
            </nav>
            <div className="grid content-start gap-2 text-[color:var(--body)]">
              <p className="font-semibold text-[color:var(--ink)]">Contact</p>
              {c.contact.phone && <a href={tel!} className="hover:text-[color:var(--primary)]">{c.contact.phone}</a>}
              {c.contact.email && <a href={`mailto:${c.contact.email}`} className="break-all hover:text-[color:var(--primary)]">{c.contact.email}</a>}
              <a href={href(s.main)} className="font-medium text-[color:var(--primary)]">{c.hero.primary_cta} →</a>
            </div>
            {!!c.brand.social?.length && (
              <div className="grid content-start gap-2 text-[color:var(--body)]">
                <p className="font-semibold text-[color:var(--ink)]">Follow {c.brand.name}</p>
                {c.brand.social.map((x) => <a key={x.url} href={x.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-[color:var(--primary)]">{SOCIAL_LABEL[x.network] ?? x.network} <span aria-hidden>↗</span><span className="sr-only"> (opens their profile in a new tab)</span></a>)}
              </div>
            )}
          </div>
          <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 border-t border-[color:var(--line)] px-5 py-5 text-xs text-[color:var(--muted)]">
            <span>© {year} {c.brand.name}</span>
            <span>Concept preview{domain ? ` for ${domain} (proposed)` : ""}</span>
          </div>
        </footer>
        {c.sections?.assistant && c.assistant && <Assistant name={c.brand.name} greeting={c.assistant.greeting} answers={c.assistant.answers} fallback={c.assistant.fallback} />}
      </>}
    </div>
  );
}

/** Facts that support credibility, each from a source we can name. Nothing is shown that we don't hold. */
function trustFacts(c: SiteContent): { label: string; value: string; note?: string }[] {
  const r = c.proof?.rating;
  const real = c.services.filter((x) => !PLACEHOLDER.test(x.title));
  return [
    r ? { label: "Google rating", value: `${r.value.toFixed(1)} / 5`, note: r.count ? `${r.count} public reviews · ${r.source}` : r.source } : null,
    real.length >= 2 ? { label: "Services", value: String(real.length), note: "Each with its own page" } : null,
    c.contact.address ? { label: "Find us", value: c.contact.address.split(",").slice(-2).join(",").trim() || c.contact.address, note: undefined } : null,
    c.contact.phone ? { label: "Talk to the team", value: c.contact.phone } : null,
  ].filter((x): x is NonNullable<typeof x> => !!x).slice(0, 4);
}

function Home({ s, home, hero }: { s: Site; home: SitePage | undefined; hero: (typeof DIRECTIONS)[keyof typeof DIRECTIONS]["hero"] }) {
  const c = s.c;
  const facts = trustFacts(c);
  const ctas = (dark = false) => (
    <div className={`mt-8 flex flex-wrap gap-3 ${hero === "centered" ? "justify-center" : ""}`}>
      <a href={s.href(s.main)} className={dark ? BTN.onDark : BTN.primary}>{c.hero.primary_cta}</a>
      {s.slugs.has("services") ? <a href={s.href("services")} className={dark ? BTN.ghostDark : BTN.secondary}>Explore services</a>
        : s.tel ? <a href={s.tel} className={dark ? BTN.ghostDark : BTN.secondary}>{c.hero.secondary_cta}</a> : null}
    </div>
  );
  const headline = <h1 className={`font-semibold leading-[1.05] tracking-tight ${hero === "editorial" ? "text-5xl sm:text-7xl" : "text-4xl sm:text-6xl"}`} style={{ fontFamily: "var(--font-heading)" }}><T>{c.hero.headline}</T></h1>;
  const eyebrow = <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${hero === "dark" ? "text-white/70" : "text-[color:var(--primary)]"}`}><T>{c.brand.eyebrow}</T></p>;
  const sub = <p className={`mt-6 max-w-2xl text-lg leading-relaxed ${hero === "dark" ? "text-white/80" : "text-[color:var(--body)]"} ${hero === "centered" ? "mx-auto" : ""}`}><T>{c.hero.sub}</T></p>;
  const homeText = home?.sections.filter((x) => x.type === "text" || x.type === "list") ?? [];
  const homeRest = home?.sections.filter((x) => x.type === "proof") ?? [];
  const homeCta = home?.sections.find((x) => x.type === "cta");
  const realServices = c.services.filter((x) => !PLACEHOLDER.test(x.title));

  return (
    <main id="top">
      {hero === "split" && (
        <section className="border-b border-[color:var(--line)] bg-[color:var(--surface)]">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:py-24 lg:grid-cols-[1.25fr_1fr] lg:items-center">
            <div>{eyebrow}<div className="mt-4">{headline}</div>{sub}{ctas()}</div>
            <aside aria-label={`About ${c.brand.name} at a glance`} className="overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-white shadow-sm">
              {c.brand.image && <SafeImg src={c.brand.image} alt="" className="aspect-[16/9] w-full object-cover" />}
              <dl className="grid divide-y divide-[color:var(--line)]">
                {(facts.length ? facts : [{ label: "Next step", value: c.hero.primary_cta }]).map((f) => <div key={f.label} className="px-6 py-4"><dt className="text-xs uppercase tracking-wider text-[color:var(--muted)]">{f.label}</dt><dd className="mt-1 text-lg font-semibold">{f.value}</dd>{f.note && <dd className="text-xs text-[color:var(--muted)]">{f.note}</dd>}</div>)}
              </dl>
            </aside>
          </div>
        </section>
      )}
      {hero === "centered" && (
        <section className="border-b border-[color:var(--line)]">
          <div className="mx-auto max-w-4xl px-5 py-20 text-center sm:py-28">
            {eyebrow}<div className="mt-5">{headline}</div>{sub}{ctas()}
            {realServices.length >= 2 && <ul className="mt-12 flex flex-wrap justify-center gap-2">{realServices.slice(0, 6).map((x) => <li key={x.title}><a href={x.slug && s.slugs.has(x.slug) ? s.href(x.slug) : s.href(s.main, x.title)} className="inline-block rounded-[var(--r-btn)] border border-[color:var(--line)] px-4 py-2 text-sm transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)]">{x.title}</a></li>)}</ul>}
          </div>
        </section>
      )}
      {hero === "dark" && (
        <section className="bg-[color:var(--dark)] text-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:py-24 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>{eyebrow}<div className="mt-4">{headline}</div>{sub}{ctas(true)}
              {facts.length > 0 && <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4">{facts.slice(0, 3).map((f) => <div key={f.label}><dt className="text-xs uppercase tracking-wider text-white/60">{f.label}</dt><dd className="text-lg font-semibold">{f.value}</dd></div>)}</dl>}
            </div>
            <div className="rounded-[var(--r-lg)] bg-white p-6 shadow-2xl sm:p-8">
              <p className="mb-4 text-lg font-semibold text-[color:var(--ink)]" style={{ fontFamily: "var(--font-heading)" }}>Quick enquiry</p>
              <EnquiryForm compact name={c.brand.name} cta={s.main === "book" ? "Request a call back" : c.hero.primary_cta} topics={realServices.map((x) => x.title).slice(0, 12)} questions={[]} alt={<Alt s={s} />} />
            </div>
          </div>
        </section>
      )}
      {hero === "grid" && (
        <section className="border-b border-[color:var(--line)] bg-[color:var(--surface)]">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:py-24 lg:grid-cols-2 lg:items-center">
            <div>{eyebrow}<div className="mt-4">{headline}</div>{sub}{ctas()}</div>
            {realServices.length >= 2 ? (
              <ul className="grid grid-cols-2 gap-3">
                {realServices.slice(0, 6).map((x, i) => <li key={x.title}><a href={x.slug && s.slugs.has(x.slug) ? s.href(x.slug) : s.href(s.main, x.title)} className="flex h-full min-h-28 flex-col justify-between rounded-[var(--r-md)] border border-[color:var(--line)] bg-white p-4 transition hover:border-[color:var(--primary)] hover:shadow-md"><span className="text-xs font-semibold text-[color:var(--primary)]">{String(i + 1).padStart(2, "0")}</span><span className="font-semibold leading-snug">{x.title}</span></a></li>)}
              </ul>
            ) : c.brand.image ? <SafeImg src={c.brand.image} alt="" className="w-full rounded-[var(--r-lg)] object-cover" /> : null}
          </div>
        </section>
      )}
      {hero === "editorial" && (
        <section className="border-b border-[color:var(--line)]">
          <div className="mx-auto max-w-6xl px-5 pb-12 pt-16 sm:pt-24">
            {eyebrow}
            <div className="mt-6 grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:items-end">{headline}<div>{sub}{ctas()}</div></div>
          </div>
          {c.brand.image ? <div className="mx-auto max-w-6xl px-5 pb-16"><SafeImg src={c.brand.image} alt="" className="aspect-[21/9] w-full rounded-[var(--r-md)] object-cover" /></div>
            : <div aria-hidden className="mx-auto mb-16 h-2 max-w-6xl bg-[linear-gradient(90deg,var(--primary),var(--secondary))]" />}
        </section>
      )}

      {hero !== "split" && hero !== "dark" && facts.length > 0 && (
        <section aria-label="At a glance" className="border-b border-[color:var(--line)]">
          <dl className="mx-auto grid max-w-6xl gap-6 px-5 py-8 sm:grid-cols-2 lg:grid-cols-4">{facts.map((f) => <div key={f.label}><dt className="text-xs uppercase tracking-wider text-[color:var(--muted)]">{f.label}</dt><dd className="mt-1 text-lg font-semibold">{f.value}</dd>{f.note && <dd className="text-xs text-[color:var(--muted)]">{f.note}</dd>}</div>)}</dl>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <H2 eyebrow="What we do">{realServices.length ? `How ${c.brand.name} can help` : "Services"}</H2>
          {s.slugs.has("services") && <a href={s.href("services")} className="text-sm font-semibold text-[color:var(--primary)] hover:underline">All services →</a>}
        </div>
        <ServiceCards s={s} limit={6} />
        {c.sections?.finder && c.finder && c.finder.options.length >= 2 && <div className="mt-10"><ServiceFinder question={c.finder.question} options={finderOptions(s)} /></div>}
      </section>

      {homeText.length > 0 && <div className="border-t border-[color:var(--line)]"><Sections s={s} sections={homeText} /></div>}

      {c.sections?.differentiation && c.features.length > 0 && (
        <section className="bg-[color:var(--surface)] py-20">
          <div className="mx-auto max-w-6xl px-5">
            <H2 eyebrow="Why choose us">Why {c.brand.name}</H2>
            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{c.features.map((f, i) => <li key={f} className="border-t-2 border-[color:var(--primary)] pt-5"><span className="text-xs font-semibold text-[color:var(--primary)]">{String(i + 1).padStart(2, "0")}</span><p className="mt-2 text-lg font-medium"><T>{f}</T></p></li>)}</ul>
          </div>
        </section>
      )}

      {homeRest.length > 0 && <Sections s={s} sections={homeRest} />}

      <section className="mx-auto max-w-6xl px-5 py-20">
        <H2 eyebrow="How it works">Getting started is simple</H2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-3">
          {c.steps.map((st, i) => <li key={i} className="relative rounded-[var(--r-lg)] border border-[color:var(--line)] bg-white p-6"><span className="grid size-9 place-items-center rounded-full bg-[color:var(--primary)] text-sm font-semibold text-[color:var(--on-primary)]">{i + 1}</span><p className="mt-4 font-medium"><T>{st}</T></p></li>)}
        </ol>
      </section>

      {!PLACEHOLDER.test(c.about) && (
        <section className="border-t border-[color:var(--line)] bg-[color:var(--surface)]">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-20 lg:grid-cols-[1fr_1.4fr]">
            <H2 eyebrow="About">About {c.brand.name}</H2>
            <div><p className="text-lg leading-relaxed text-[color:var(--body)]">{c.about}</p>{s.slugs.has("about") && <a href={s.href("about")} className="mt-6 inline-block font-semibold text-[color:var(--primary)] hover:underline">More about {c.brand.name} →</a>}</div>
          </div>
        </section>
      )}

      {c.sections?.faq && c.faq && c.faq.length > 0 && (
        <section className="mx-auto max-w-3xl px-5 py-20">
          <H2 eyebrow="Questions">Before you get in touch</H2>
          <div className="mt-8 divide-y divide-[color:var(--line)] rounded-[var(--r-lg)] border border-[color:var(--line)] bg-white">
            {c.faq.slice(0, 4).map((f) => <details key={f.q} className="group px-5 py-4"><summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-medium marker:hidden">{f.q}<span aria-hidden className="text-xl leading-none text-[color:var(--primary)] transition group-open:rotate-45">+</span></summary><p className="mt-2 text-[color:var(--body)]">{f.a}</p></details>)}
          </div>
          {s.slugs.has("faq") && <a href={s.href("faq")} className="mt-6 inline-block font-semibold text-[color:var(--primary)] hover:underline">All questions →</a>}
        </section>
      )}

      {homeCta?.type === "cta"
        ? <PrimaryCta s={s} heading={homeCta.heading} text={homeCta.text} target={homeCta.target} topic={homeCta.topic} secondary={homeCta.secondary} />
        : <PrimaryCta s={s} heading={`${c.hero.primary_cta} with ${c.brand.name}`} text="Tell the team what you need and get a clear next step." secondary={s.slugs.has("services") ? { label: "Explore services", target: "services" } : null} />}
    </main>
  );
}
