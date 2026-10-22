// Inner pages of a multi-page preview, built from the blueprint. Original text from the business's
// own pages is rendered as escaped React text; prices and links to their articles say where they came from.
import type { Section, SitePage } from "@/lib/studio/blueprint";
import type { SiteContent } from "@/lib/studio/site";
import { QualifyForm, ServiceFinder, WorkflowDemo } from "@/components/preview-demos";

export const workflowSteps = (c: SiteContent) => [
  `A visitor ${c.booking ? "requests a booking" : "sends an enquiry"} on the website`,
  "Their answers qualify the enquiry and a CRM lead is created",
  `The enquiry is routed to the right person at ${c.brand.name}`,
  "The visitor gets an instant confirmation",
  "The team gets an alert and a follow-up reminder",
  "The outcome is tracked against the agreed KPIs",
];

const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{children}</h2>;

export function Sections({ c, sections, href, tel }: { c: SiteContent; sections: Section[]; href: (slug: string) => string; tel: string | null }) {
  const seenForm = { done: false };
  return (
    <>
      {sections.map((s, i) => {
        switch (s.type) {
          case "text":
            return <section key={i} className="mx-auto max-w-3xl px-5 py-8">{s.heading && <H2>{s.heading}</H2>}<div className="mt-4 space-y-4 leading-relaxed text-neutral-700">{s.paragraphs.map((p) => <p key={p}>{p}</p>)}</div></section>;
          case "list":
            return <section key={i} className="mx-auto max-w-5xl px-5 py-8">{s.heading && <H2>{s.heading}</H2>}<ul className="mt-5 grid gap-3 sm:grid-cols-2">{s.items.map((t) => <li key={t} className="flex gap-3 rounded-xl bg-[color:var(--soft)] px-4 py-3 text-sm"><span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[color:var(--accent)]" />{t}</li>)}</ul></section>;
          case "faq":
            return (
              <section key={i} className="mx-auto max-w-3xl px-5 py-8">
                <H2>{s.heading ?? "Questions"}</H2>
                <div className="mt-6 divide-y divide-neutral-200 rounded-2xl ring-1 ring-neutral-200">
                  {s.items.map((f) => <details key={f.q} className="group px-5 py-4"><summary className="cursor-pointer list-none font-medium">{f.q}<span aria-hidden className="float-right transition group-open:rotate-45">+</span></summary><p className="mt-2 text-sm text-neutral-700">{f.a}</p></details>)}
                </div>
              </section>
            );
          case "prices":
            return (
              <section key={i} className="mx-auto max-w-3xl px-5 py-8">
                <H2>{s.heading ?? "Prices"}</H2>
                <ul className="mt-4 space-y-2 text-sm">{s.items.map((p) => <li key={p} className="rounded-xl px-4 py-3 ring-1 ring-neutral-200">{p}</li>)}</ul>
                <p className="mt-2 text-xs text-neutral-500">As published on their current website; to be confirmed by {c.brand.name}.</p>
              </section>
            );
          case "links":
            return (
              <section key={i} className="mx-auto max-w-5xl px-5 py-8">
                {s.heading && <H2>{s.heading}</H2>}
                <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                  {s.items.map((l) => <li key={l.url} className="rounded-2xl p-5 ring-1 ring-neutral-200"><p className="font-semibold">{l.title}</p>{l.summary && <p className="mt-1 text-sm text-neutral-600">{l.summary}</p>}<a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 inline-block text-sm font-medium text-[color:var(--accent)]">Read on their current site ↗</a></li>)}
                </ul>
              </section>
            );
          case "services":
            return (
              <section key={i} className="mx-auto max-w-6xl px-5 py-8">
                <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {c.services.map((sv) => <li key={sv.title} className="flex flex-col rounded-2xl border border-neutral-200 p-6"><h3 className="font-semibold">{sv.title}</h3>{sv.text && <p className="mt-2 text-sm text-neutral-600">{sv.text}</p>}<a href={sv.slug ? href(sv.slug) : href("contact")} className="mt-auto pt-4 text-sm font-medium text-[color:var(--accent)]">{sv.slug ? "Learn more →" : "Ask about this →"}</a></li>)}
                </ul>
              </section>
            );
          case "finder":
            return c.finder && c.finder.options.length >= 2 ? <section key={i} className="mx-auto max-w-5xl px-5 py-8"><ServiceFinder question={c.finder.question} options={c.finder.options} /></section> : null;
          case "qualify": case "booking":
            if (seenForm.done || !c.growth) return null;
            seenForm.done = true;
            return <section key={i} className="bg-[color:var(--ink)] py-12"><div className="mx-auto max-w-2xl px-5"><QualifyForm cta={c.hero.primary_cta} questions={c.growth.qualify} booking={c.booking || s.type === "booking"} name={c.brand.name} /></div></section>;
          case "workflow":
            return <section key={i} className="mx-auto max-w-5xl px-5 py-8"><WorkflowDemo steps={workflowSteps(c)} /></section>;
          case "contact":
            return (
              <section key={i} className="mx-auto max-w-3xl px-5 py-8">
                <H2>Contact {c.brand.name}</H2>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  {c.contact.phone && <div><dt className="text-neutral-500">Phone</dt><dd><a href={tel!} className="underline">{c.contact.phone}</a></dd></div>}
                  {c.contact.email && <div><dt className="text-neutral-500">Email</dt><dd>{c.contact.email}</dd></div>}
                  {c.contact.address && <div><dt className="text-neutral-500">Address</dt><dd>{c.contact.address}</dd></div>}
                </dl>
              </section>
            );
          case "cta":
            return <section key={i} className="mx-auto max-w-5xl px-5 py-8"><div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[color:var(--soft)] p-6"><div><p className="text-lg font-semibold">{s.heading}</p><p className="text-sm text-neutral-700">{s.text}</p></div><a href={href("contact")} className="rounded-full bg-[color:var(--accent)] px-6 py-3 font-medium text-white">{c.hero.primary_cta}</a></div></section>;
        }
      })}
    </>
  );
}

export function PageView({ c, p, href, tel }: { c: SiteContent; p: SitePage; href: (slug: string) => string; tel: string | null }) {
  const sections: Section[] = p.slug === "faq" && !p.sections.some((s) => s.type === "faq") && c.faq?.length ? [...p.sections, { type: "faq", items: c.faq }] : p.sections;
  return (
    <main id="top">
      <section className="bg-[color:var(--soft)]">
        <div className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
          <nav aria-label="Breadcrumb" className="text-xs text-neutral-600"><a href={href("home")} className="hover:underline">Home</a> / {p.title}</nav>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{p.heading}</h1>
          {p.intro && <p className="mt-4 max-w-3xl text-lg text-neutral-700">{p.intro}</p>}
        </div>
      </section>
      <Sections c={c} sections={sections} href={href} tel={tel} />
      {p.sources.length > 0 && <p className="mx-auto max-w-5xl px-5 pb-8 text-xs text-neutral-500">Content from their current page{p.sources.length > 1 ? "s" : ""}: {p.sources.map((u, i) => <span key={u}>{i ? ", " : ""}{new URL(u).pathname || "/"}</span>)}</p>}
    </main>
  );
}
