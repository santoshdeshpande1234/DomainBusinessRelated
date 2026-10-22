// Renders a website preview from stored content. All text is rendered as React text (escaped), and
// placeholders are highlighted so an unfinished draft is obvious. The contact form is inert.
import { PLACEHOLDER, THEMES, jsonLd, type SiteContent, type ThemeKey } from "@/lib/studio/site";

function T({ children }: { children: string }) {
  if (!PLACEHOLDER.test(children)) return <>{children}</>;
  return <>{children.split(/(\[\[[^\]]*\]\])/).map((part, i) => PLACEHOLDER.test(part)
    ? <mark key={i} className="rounded bg-amber-200 px-1 text-amber-950">{part.slice(2, -2)}</mark> : part)}</>;
}

export function SitePreview({ content: c, theme, layout, domain, owner, year }: {
  content: SiteContent; theme: string; layout: string; domain: string | null; owner: string; year: number;
}) {
  const t = THEMES[(theme in THEMES ? theme : "harbor") as ThemeKey];
  const vars = { "--ink": t.ink, "--accent": t.accent, "--soft": t.soft, fontFamily: t.font } as React.CSSProperties;
  const tel = c.contact.phone ? `tel:${c.contact.phone.replace(/[^\d+]/g, "")}` : null;
  const centered = layout === "centered";

  return (
    <div style={vars} className="min-h-screen bg-white text-[color:var(--ink)] [color-scheme:light]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(c, domain ? `https://${domain}` : null)).replace(/</g, "\\u003c") }} />
      <div role="note" className="bg-neutral-900 px-4 py-2 text-center text-xs text-neutral-100">
        Website concept for {c.brand.name}, prepared by {owner}. Not the business&apos;s live website{domain ? `; ${domain} is a proposed domain, not yet owned` : ""}.
      </div>
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <a href="#top" className="text-lg font-semibold tracking-tight">{c.brand.name}</a>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-5 text-sm">
            <a href="#services" className="hover:underline">Services</a>
            <a href="#about" className="hover:underline">About</a>
            <a href="#contact" className="hover:underline">Contact</a>
            {tel && <a href={tel} className="rounded-full bg-[color:var(--accent)] px-4 py-2 font-medium text-white">{c.contact.phone}</a>}
          </nav>
        </div>
      </header>

      <main id="top">
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
                <a href="#contact" className="mt-4 inline-block text-sm font-medium text-[color:var(--accent)]">Ask about this →</a>
              </li>
            ))}
          </ul>
        </section>

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
            {centered && <ul className="mt-10 grid gap-3 sm:grid-cols-2">{c.features.map((f) => <li key={f} className="flex gap-3 text-sm"><span aria-hidden className="mt-1 size-2 shrink-0 rounded-full bg-[color:var(--accent)]" /><T>{f}</T></li>)}</ul>}
          </div>
        </section>

        <section id="about" className="mx-auto max-w-3xl px-5 py-16">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">About {c.brand.name}</h2>
          <p className="mt-4 leading-relaxed text-neutral-700"><T>{c.about}</T></p>
        </section>

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
          </div>
        </section>
      </main>

      <footer className="border-t border-neutral-200">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-5 py-6 text-xs text-neutral-500">
          <span>© {year} {c.brand.name}</span>
          <span>Concept preview{domain ? ` for ${domain} (proposed)` : ""}</span>
        </div>
      </footer>
    </div>
  );
}
