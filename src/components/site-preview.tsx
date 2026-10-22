// Renders a website preview from stored content. All text is rendered as React text (escaped), and
// placeholders are highlighted so an unfinished draft is obvious. Forms and demos send nothing.
// Two pages: the proposed website, and the client-facing growth plan (when the preview has one).
import { PLACEHOLDER, THEMES, jsonLd, type SiteContent, type ThemeKey } from "@/lib/studio/site";
import { Assistant, QualifyForm, ServiceFinder } from "@/components/preview-demos";
import { GrowthPlanView } from "@/components/growth-plan";
import { PageView, Sections } from "@/components/site-pages";

function T({ children }: { children: string }) {
  if (!PLACEHOLDER.test(children)) return <>{children}</>;
  return <>{children.split(/(\[\[[^\]]*\]\])/).map((part, i) => PLACEHOLDER.test(part)
    ? <mark key={i} className="rounded bg-amber-200 px-1 text-amber-950">{part.slice(2, -2)}</mark> : part)}</>;
}

export function SitePreview({ content: c, theme, layout, domain, owner, year, view = "site", links, page, pageHref }: {
  content: SiteContent; theme: string; layout: string; domain: string | null; owner: string; year: number;
  view?: "site" | "plan"; links?: { site: string; plan: string };
  /** Multi-page previews: the page to show and how to link to another page. */
  page?: string | null; pageHref?: (slug: string) => string;
}) {
  const t = THEMES[(theme in THEMES ? theme : "harbor") as ThemeKey];
  // Their own brand colours, when we found them, win over the theme's.
  const own = c.brand.colors;
  const vars = { "--ink": own?.ink ?? t.ink, "--accent": own?.accent ?? t.accent, "--soft": own?.accent ? `color-mix(in srgb, ${own.accent} 10%, white)` : t.soft, fontFamily: t.font } as React.CSSProperties;
  const multi = !!(c.pages?.length && pageHref);
  const href = (slug: string) => (multi ? pageHref!(slug) : slug === "home" ? "#top" : `#${slug === "contact" ? "contact" : slug}`);
  const current = multi && page && page !== "home" ? c.pages!.find((p) => p.slug === page) ?? null : null;
  const homePage = c.pages?.find((p) => p.slug === "home");
  const navPages = multi ? c.pages!.filter((p) => p.nav && p.slug !== "home") : [];
  const tel = c.contact.phone ? `tel:${c.contact.phone.replace(/[^\d+]/g, "")}` : null;
  const centered = layout === "centered";
  const sec = c.sections;
  const plan = view === "plan" && c.growth;

  return (
    <div style={vars} className="min-h-screen bg-white text-[color:var(--ink)] [color-scheme:light]">
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
      {plan ? <GrowthPlanView c={c} owner={owner} siteHref={links?.site ?? "#"} /> : <>
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <a href={href("home")} className="flex items-center gap-3 text-lg font-semibold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element -- their own logo, loaded from their site */}
            {c.brand.logo && <img src={c.brand.logo} alt="" referrerPolicy="no-referrer" className="h-9 w-auto max-w-[140px] object-contain" />}
            {c.brand.name}
          </a>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {multi ? navPages.map((p) => <a key={p.slug} href={href(p.slug)} aria-current={page === p.slug ? "page" : undefined} className={`hover:underline ${page === p.slug ? "font-semibold" : ""}`}>{p.nav}</a>) : <>
            <a href="#services" className="hover:underline">Services</a>
            <a href="#about" className="hover:underline">About</a>
            {sec?.faq && c.faq?.length ? <a href="#faq" className="hover:underline">FAQ</a> : null}
            <a href="#contact" className="hover:underline">Contact</a></>}
            {tel && <a href={tel} className="rounded-full bg-[color:var(--accent)] px-4 py-2 font-medium text-white">{c.contact.phone}</a>}
          </nav>
        </div>
      </header>

      {current ? <PageView c={c} p={current} href={href} tel={tel} /> : <main id="top">
        <section className="bg-[color:var(--soft)]">
          <div className={`mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:py-24 ${centered ? "text-center" : "lg:grid-cols-[1.3fr_1fr] lg:items-center"}`}>
            <div className={centered ? "mx-auto max-w-3xl" : ""}>
              <p className="text-sm font-semibold uppercase tracking-wider text-[color:var(--accent)]"><T>{c.brand.eyebrow}</T></p>
              <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl"><T>{c.hero.headline}</T></h1>
              <p className="mt-5 text-lg text-neutral-700"><T>{c.hero.sub}</T></p>
              <div className={`mt-8 flex flex-wrap gap-3 ${centered ? "justify-center" : ""}`}>
                <a href="#contact" className="rounded-full bg-[color:var(--accent)] px-6 py-3 font-medium text-white">{c.hero.primary_cta}</a>
                <a href={tel ?? "#contact"} className="rounded-full border border-[color:var(--ink)] px-6 py-3 font-medium">{c.hero.secondary_cta}</a>
              </div>
            </div>
            {!centered && (
              <ul className="space-y-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                {c.features.map((f) => <li key={f} className="flex gap-3 text-sm"><span aria-hidden className="mt-1 size-2 shrink-0 rounded-full bg-[color:var(--accent)]" /><T>{f}</T></li>)}
              </ul>
            )}
          </div>
        </section>

        <section id="services" className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Services</h2>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {c.services.map((s, i) => (
              <li key={i} className="rounded-2xl border border-neutral-200 p-6">
                <h3 className="font-semibold"><T>{s.title}</T></h3>
                {s.text && <p className="mt-2 text-sm text-neutral-600"><T>{s.text}</T></p>}
                <a href={multi && s.slug ? href(s.slug) : "#contact"} className="mt-4 inline-block text-sm font-medium text-[color:var(--accent)]">{multi && s.slug ? "Learn more →" : "Ask about this →"}</a>
              </li>
            ))}
          </ul>
          {sec?.finder && c.finder && c.finder.options.length >= 2 && <div className="mt-10"><ServiceFinder question={c.finder.question} options={c.finder.options} /></div>}
        </section>

        {multi && homePage && <Sections c={c} sections={homePage.sections.filter((x) => x.type === "text" || x.type === "list")} href={href} tel={tel} />}

        {sec?.differentiation && c.features.length > 0 && (
          <section className="mx-auto max-w-6xl px-5 pb-16">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Why choose {c.brand.name}</h2>
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {c.features.map((f) => <li key={f} className="rounded-2xl bg-[color:var(--soft)] p-6 font-medium"><T>{f}</T></li>)}
            </ul>
          </section>
        )}

        <section className="bg-neutral-50">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
            <ol className="mt-8 grid gap-5 sm:grid-cols-3">
              {c.steps.map((s, i) => (
                <li key={i} className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
                  <span className="grid size-8 place-items-center rounded-full bg-[color:var(--accent)] text-sm font-semibold text-white">{i + 1}</span>
                  <p className="mt-3 font-medium"><T>{s}</T></p>
                </li>
              ))}
            </ol>
            {centered && !sec?.differentiation && <ul className="mt-10 grid gap-3 sm:grid-cols-2">{c.features.map((f) => <li key={f} className="flex gap-3 text-sm"><span aria-hidden className="mt-1 size-2 shrink-0 rounded-full bg-[color:var(--accent)]" /><T>{f}</T></li>)}</ul>}
          </div>
        </section>

        <section id="about" className="mx-auto max-w-3xl px-5 py-16">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">About {c.brand.name}</h2>
          <p className="mt-4 leading-relaxed text-neutral-700"><T>{c.about}</T></p>
        </section>

        {sec?.faq && c.faq && c.faq.length > 0 && (
          <section id="faq" className="mx-auto max-w-3xl px-5 pb-16">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Questions</h2>
            <div className="mt-6 divide-y divide-neutral-200 rounded-2xl ring-1 ring-neutral-200">
              {c.faq.map((f) => (
                <details key={f.q} className="group px-5 py-4">
                  <summary className="cursor-pointer list-none font-medium marker:hidden">{f.q}<span aria-hidden className="float-right transition group-open:rotate-45">+</span></summary>
                  <p className="mt-2 text-sm text-neutral-700">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        <section id="contact" className="bg-[color:var(--ink)] text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{c.hero.primary_cta}</h2>
              <dl className="mt-6 space-y-3 text-sm">
                {c.contact.phone && <div><dt className="opacity-70">Phone</dt><dd><a href={tel!} className="underline">{c.contact.phone}</a></dd></div>}
                {c.contact.email && <div><dt className="opacity-70">Email</dt><dd>{c.contact.email}</dd></div>}
                {c.contact.address && <div><dt className="opacity-70">Address</dt><dd>{c.contact.address}{c.contact.maps_url && <> · <a href={c.contact.maps_url} className="underline" rel="nofollow noopener noreferrer" target="_blank">Map</a></>}</dd></div>}
              </dl>
            </div>
            {sec?.qualify && c.growth ? <QualifyForm cta={c.hero.primary_cta} questions={c.growth.qualify} booking={c.booking} name={c.brand.name} /> : (
              <form aria-label={`${c.hero.primary_cta} (preview, not active)`} className="grid gap-3 rounded-2xl bg-white p-6 text-[color:var(--ink)]">
              <label className="text-sm font-medium" htmlFor="pv-name">Name</label>
              <input id="pv-name" disabled className="rounded-lg border border-neutral-300 px-3 py-2" />
              <label className="text-sm font-medium" htmlFor="pv-contact">Phone or email</label>
              <input id="pv-contact" disabled className="rounded-lg border border-neutral-300 px-3 py-2" />
              <label className="text-sm font-medium" htmlFor="pv-msg">How can we help?</label>
              <textarea id="pv-msg" disabled rows={3} className="rounded-lg border border-neutral-300 px-3 py-2" />
              {c.booking && <><label className="text-sm font-medium" htmlFor="pv-date">Preferred date</label><input id="pv-date" type="date" disabled className="rounded-lg border border-neutral-300 px-3 py-2" /></>}
              <button type="button" disabled className="mt-2 rounded-full bg-[color:var(--accent)] px-6 py-3 font-medium text-white opacity-90">{c.hero.primary_cta}</button>
              <p className="text-xs text-neutral-500">Preview only: this form is not connected and sends nothing.</p>
            </form>
            )}
          </div>
        </section>
      </main>}

      <footer className="border-t border-neutral-200">
        {c.growth && (
          <div className="mx-auto grid max-w-6xl gap-6 px-5 pt-8 text-sm sm:grid-cols-3">
            <div><p className="font-semibold">{c.brand.name}</p>{c.contact.address && <p className="mt-1 text-neutral-600">{c.contact.address}</p>}</div>
            <nav aria-label="Footer" className="flex flex-col gap-1 text-neutral-600">{multi ? navPages.map((p) => <a key={p.slug} href={href(p.slug)}>{p.nav}</a>) : <><a href="#services">Services</a><a href="#about">About</a>{sec?.faq && <a href="#faq">FAQ</a>}<a href="#contact">Contact</a></>}</nav>
            <div className="text-neutral-600">{c.contact.phone && <p><a href={tel!}>{c.contact.phone}</a></p>}{c.contact.email && <p>{c.contact.email}</p>}</div>
          </div>
        )}
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-5 py-6 text-xs text-neutral-500">
          <span>© {year} {c.brand.name}</span>
          <span>Concept preview{domain ? ` for ${domain} (proposed)` : ""}</span>
        </div>
      </footer>
      {sec?.assistant && c.assistant && <Assistant name={c.brand.name} greeting={c.assistant.greeting} answers={c.assistant.answers} fallback={c.assistant.fallback} />}
      </>}
    </div>
  );
}
