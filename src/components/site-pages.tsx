// Sections and inner pages of a proposed website, built from the blueprint. Text from the business's
// own pages is rendered as escaped React text. Every link leads to a page of this site, a phone number,
// an email address, a map, or one of their official social profiles; never back to their old website.
import type { Section, SitePage } from "@/lib/studio/blueprint";
import type { SiteContent } from "@/lib/studio/site";
import { ServiceFinder, WorkflowDemo } from "@/components/preview-demos";
import { BookingFlow, CapabilityExplorer, EnquiryForm, type Capability } from "@/components/site-interactive";

export type Site = {
  c: SiteContent;
  /** A page of this site, optionally with a topic the enquiry form should arrive with. */
  href: (slug: string, topic?: string) => string;
  tel: string | null;
  /** The page the main call to action opens (book, quote or contact). */
  main: string;
  slugs: Set<string>;
};

export const workflowSteps = (c: SiteContent) => [
  `A visitor ${c.booking ? "requests a booking" : "sends an enquiry"} on the website`,
  "Their answers qualify the enquiry and a CRM lead is created",
  `The enquiry is routed to the right person at ${c.brand.name}`,
  "The visitor gets an instant confirmation",
  "The team gets an alert and a follow-up reminder",
  "The outcome is tracked against the agreed KPIs",
];

export const H2 = ({ children, eyebrow }: { children: React.ReactNode; eyebrow?: string }) => (
  <div>
    {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--primary)]">{eyebrow}</p>}
    <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl" style={{ fontFamily: "var(--font-heading)" }}>{children}</h2>
  </div>
);

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const path = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };
const btn = "inline-flex items-center justify-center gap-2 rounded-[var(--r-btn)] px-6 py-3 font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus)] active:translate-y-px";
export const BTN = {
  primary: `${btn} bg-[color:var(--accent)] text-[color:var(--on-accent)] shadow-sm hover:brightness-110`,
  secondary: `${btn} border border-[color:var(--line)] bg-white text-[color:var(--ink)] hover:border-[color:var(--primary)]`,
  onDark: `${btn} bg-white text-[color:var(--ink)] shadow-sm hover:bg-white/90`,
  ghostDark: `${btn} border border-white/40 text-white hover:bg-white/10`,
};

/** Alternative ways to reach the business, for forms in a preview. */
export function Alt({ s }: { s: Site }) {
  const c = s.c.contact;
  if (!s.tel && !c.email) return <span>Use the contact page.</span>;
  return <span>{s.tel && <>Call <a href={s.tel} className="font-medium underline">{c.phone}</a></>}{s.tel && c.email && " or "}{c.email && <>email <a href={`mailto:${c.email}`} className="font-medium underline">{c.email}</a></>}.</span>;
}

/** The services, as capabilities: each opens its own page when there is one, else asks about it. */
export function capabilities(s: Site, labels: string[]): Capability[] {
  return labels.map((label) => {
    const sv = s.c.services.find((x) => x.title.toLowerCase() === label.toLowerCase());
    return { label, detail: sv?.text || null, href: sv?.slug && s.slugs.has(sv.slug) ? s.href(sv.slug) : null, ask: s.href(s.main === "book" ? "book" : "contact", label) };
  });
}

/** Service finder options with a real destination: the service's page, or the enquiry with that topic. */
export function finderOptions(s: Site) {
  return (s.c.finder?.options ?? []).map((o) => {
    const sv = s.c.services.find((x) => x.title === o.service);
    return { ...o, href: sv?.slug && s.slugs.has(sv.slug) ? s.href(sv.slug) : s.href(s.main === "book" ? "book" : "contact", o.need) };
  });
}

/** The high-priority call to action: contrast band, value line, one primary and one lighter action. */
export function PrimaryCta({ s, heading, text, target, topic, secondary }: { s: Site; heading: string; text: string; target?: string; topic?: string; secondary?: { label: string; target: string } | null }) {
  const to = target && s.slugs.has(target) ? target : s.main;
  const label = to === "contact" && s.main !== "contact" ? "Contact the team" : s.c.hero.primary_cta;
  return (
    <section className="px-5 py-12">
      <div className="mx-auto grid max-w-6xl gap-6 overflow-hidden rounded-[var(--r-lg)] bg-[color:var(--dark)] p-8 text-[color:var(--on-dark)] sm:p-12 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex gap-5">
          {s.c.booking && (
            <span aria-hidden className="hidden size-12 shrink-0 place-items-center rounded-[var(--r-md)] bg-white/10 sm:grid">
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
            </span>
          )}
          <div>
            <h2 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl" style={{ fontFamily: "var(--font-heading)" }}>{heading}</h2>
            <p className="mt-3 max-w-2xl text-white/80">{text}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href={s.href(to, topic)} className={BTN.onDark}>{label}</a>
          {secondary && s.slugs.has(secondary.target) && <a href={s.href(secondary.target)} className={BTN.ghostDark}>{secondary.label}</a>}
        </div>
      </div>
    </section>
  );
}

export function ServiceCards({ s, limit }: { s: Site; limit?: number }) {
  const list = s.c.services.slice(0, limit ?? 12);
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((sv) => {
        const to = sv.slug && s.slugs.has(sv.slug) ? s.href(sv.slug) : s.href(s.main === "book" ? "book" : "contact", sv.title);
        return (
          <li key={sv.title}>
            <a href={to} className="group flex h-full flex-col rounded-[var(--r-lg)] border border-[color:var(--line)] bg-white p-6 transition hover:-translate-y-0.5 hover:border-[color:var(--primary)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus)] motion-reduce:hover:translate-y-0">
              <span aria-hidden className="mb-4 h-1 w-10 rounded-full bg-[color:var(--primary)]" />
              <h3 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)" }}>{sv.title}</h3>
              {sv.text && <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-[color:var(--body)]">{sv.text}</p>}
              <span className="mt-auto pt-5 text-sm font-semibold text-[color:var(--primary)]">{sv.slug && s.slugs.has(sv.slug) ? "Learn more" : "Ask about this"} <span aria-hidden className="inline-block transition group-hover:translate-x-1">→</span></span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function Proof({ s, sec }: { s: Site; sec: Extract<Section, { type: "proof" }> }) {
  const own = host(s.c.sources.find((x) => x.label === "Their current website")?.url ?? s.c.sources.find((x) => x.url)?.url ?? "");
  if (sec.kind === "credentials") return (
    <section className="mx-auto max-w-5xl px-5 py-10">
      <H2>{sec.heading ?? "Credentials"}</H2>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {sec.attributed.map((x) => <li key={x.text} className="rounded-[var(--r-md)] border border-[color:var(--line)] bg-white p-4 text-sm"><p>{x.text}</p><p className="mt-2 text-xs text-[color:var(--muted)]">As published on {own || "their website"}{path(x.source) !== "/" ? path(x.source) : ""}</p></li>)}
      </ul>
    </section>
  );
  return (
    <section className="bg-[color:var(--surface)] py-14">
      <div className="mx-auto max-w-6xl px-5">
        <H2 eyebrow="Client feedback">{sec.heading ?? "What clients say"}</H2>
        <ul className="mt-8 grid gap-5 md:grid-cols-3">
          {sec.attributed.map((x) => {
            // “Quote.” – Name, as published: the attribution is shown as written, never added.
            const m = x.text.match(/^["“](.+?)["”]\s*[–—-]\s*(.{2,80})$/);
            return (
            <li key={x.text} className="flex flex-col rounded-[var(--r-lg)] border border-[color:var(--line)] bg-white p-6">
              <span aria-hidden className="text-4xl leading-none text-[color:var(--primary)]">“</span>
              <blockquote className="mt-1 text-[15px] leading-relaxed text-[color:var(--body)]">{m ? m[1] : x.text.replace(/^["“]|["”]$/g, "")}</blockquote>
              {m && <p className="mt-3 text-sm font-medium">{m[2]}</p>}
              <p className="mt-auto pt-4 text-xs text-[color:var(--muted)]">Quoted from {own || "their website"}{path(x.source) !== "/" ? path(x.source) : ""}</p>
            </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function Sections({ s, sections }: { s: Site; sections: Section[] }) {
  const c = s.c;
  const seen = { form: false };
  const topics = c.services.map((x) => x.title).slice(0, 12);
  const alt = <Alt s={s} />;
  return (
    <>
      {sections.map((sec, i) => {
        switch (sec.type) {
          case "text":
            return <section key={i} className="mx-auto max-w-3xl px-5 py-10">{sec.heading && <H2>{sec.heading}</H2>}<div className="mt-5 space-y-5 text-[17px] leading-relaxed text-[color:var(--body)]">{sec.paragraphs.map((p) => <p key={p}>{p}</p>)}</div></section>;
          case "list":
            // Capabilities and modules are explorable, not a static list.
            return <section key={i} className="mx-auto max-w-6xl px-5 py-12">{sec.heading && <div className="mb-8"><H2>{sec.heading}</H2></div>}<CapabilityExplorer heading={sec.heading ?? null} items={capabilities(s, sec.items)} name={c.brand.name} /></section>;
          case "faq":
            return (
              <section key={i} className="mx-auto max-w-3xl px-5 py-10">
                <H2>{sec.heading ?? "Questions"}</H2>
                <div className="mt-6 divide-y divide-[color:var(--line)] rounded-[var(--r-lg)] border border-[color:var(--line)] bg-white">
                  {sec.items.map((f) => <details key={f.q} className="group px-5 py-4"><summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-medium marker:hidden">{f.q}<span aria-hidden className="text-xl leading-none text-[color:var(--primary)] transition group-open:rotate-45">+</span></summary><p className="mt-2 text-[color:var(--body)]">{f.a}</p></details>)}
                </div>
              </section>
            );
          case "prices":
            return (
              <section key={i} className="mx-auto max-w-3xl px-5 py-10">
                <H2>{sec.heading ?? "Prices"}</H2>
                <ul className="mt-5 divide-y divide-[color:var(--line)] rounded-[var(--r-lg)] border border-[color:var(--line)] bg-white text-sm">{sec.items.map((p) => <li key={p} className="px-5 py-3">{p}</li>)}</ul>
                <p className="mt-2 text-xs text-[color:var(--muted)]">As published by {c.brand.name}; confirm current prices when you enquire.</p>
              </section>
            );
          case "links":
            // Older previews linked out to the original site; the titles and summaries stay, the links don't.
            return (
              <section key={i} className="mx-auto max-w-5xl px-5 py-10">
                {sec.heading && <H2>{sec.heading}</H2>}
                <ul className="mt-6 grid gap-4 sm:grid-cols-2">{sec.items.map((l) => <li key={l.url} className="rounded-[var(--r-lg)] border border-[color:var(--line)] bg-white p-5"><p className="font-semibold">{l.title}</p>{l.summary && <p className="mt-1 text-sm text-[color:var(--body)]">{l.summary}</p>}</li>)}</ul>
              </section>
            );
          case "articles":
            return (
              <section key={i} className="mx-auto max-w-6xl px-5 py-10">
                {sec.heading && <div className="mb-6"><H2>{sec.heading}</H2></div>}
                <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {sec.items.filter((a) => s.slugs.has(a.slug)).map((a) => (
                    <li key={a.slug}><a href={s.href(a.slug)} className="group flex h-full flex-col rounded-[var(--r-lg)] border border-[color:var(--line)] bg-white p-6 transition hover:border-[color:var(--primary)] hover:shadow-md">
                      <h3 className="font-semibold" style={{ fontFamily: "var(--font-heading)" }}>{a.title}</h3>
                      {a.summary && <p className="mt-2 line-clamp-3 text-sm text-[color:var(--body)]">{a.summary}</p>}
                      <span className="mt-auto pt-4 text-sm font-semibold text-[color:var(--primary)]">Read <span aria-hidden className="inline-block transition group-hover:translate-x-1">→</span></span>
                    </a></li>
                  ))}
                </ul>
              </section>
            );
          case "proof":
            return <Proof key={i} s={s} sec={sec} />;
          case "services":
            return <section key={i} className="mx-auto max-w-6xl px-5 py-10"><ServiceCards s={s} /></section>;
          case "finder":
            return c.finder && c.finder.options.length >= 2 ? <section key={i} className="mx-auto max-w-5xl px-5 py-8"><ServiceFinder question={c.finder.question} options={finderOptions(s)} /></section> : null;
          case "booking":
            if (seen.form) return null;
            seen.form = true;
            return <section key={i} className="mx-auto max-w-3xl px-5 py-10"><BookingFlow name={c.brand.name} cta={c.hero.primary_cta} services={topics} alt={alt} /></section>;
          case "qualify":
            if (seen.form) return null;
            seen.form = true;
            return <section key={i} className="mx-auto max-w-3xl px-5 py-10"><EnquiryForm name={c.brand.name} cta={s.main === "book" ? "Send an enquiry" : c.hero.primary_cta} topics={topics} questions={c.growth?.qualify ?? []} alt={alt} /></section>;
          case "workflow":
            return <section key={i} className="mx-auto max-w-5xl px-5 py-8"><WorkflowDemo steps={workflowSteps(c)} /></section>;
          case "contact":
            return (
              <section key={i} className="mx-auto max-w-3xl px-5 py-10">
                <H2>Contact {c.brand.name}</H2>
                <dl className="mt-6 grid gap-4 sm:grid-cols-3">
                  {c.contact.phone && <div className="rounded-[var(--r-md)] border border-[color:var(--line)] p-4"><dt className="text-xs text-[color:var(--muted)]">Phone</dt><dd className="mt-1 font-medium"><a href={s.tel!} className="underline-offset-4 hover:underline">{c.contact.phone}</a></dd></div>}
                  {c.contact.email && <div className="rounded-[var(--r-md)] border border-[color:var(--line)] p-4"><dt className="text-xs text-[color:var(--muted)]">Email</dt><dd className="mt-1 break-all font-medium"><a href={`mailto:${c.contact.email}`} className="underline-offset-4 hover:underline">{c.contact.email}</a></dd></div>}
                  {c.contact.address && <div className="rounded-[var(--r-md)] border border-[color:var(--line)] p-4"><dt className="text-xs text-[color:var(--muted)]">Address</dt><dd className="mt-1 font-medium">{c.contact.address}{c.contact.maps_url && <> · <a href={c.contact.maps_url} target="_blank" rel="noopener noreferrer nofollow" className="text-[color:var(--primary)] underline">Map</a></>}</dd></div>}
                </dl>
              </section>
            );
          case "cta":
            return <PrimaryCta key={i} s={s} heading={sec.heading} text={sec.text} target={sec.target} topic={sec.topic} secondary={sec.secondary} />;
        }
      })}
    </>
  );
}

const ENDS_WITH_ACTION = new Set(["cta", "qualify", "booking"]);

/** An inner page: page header, its sections, a next step if it has none, and the source it came from. */
export function PageView({ s, p }: { s: Site; p: SitePage }) {
  const c = s.c;
  let sections: Section[] = p.slug === "faq" && !p.sections.some((x) => x.type === "faq") && c.faq?.length ? [...p.sections, { type: "faq", items: c.faq }] : p.sections;
  // The contact page always has a working form and the details; the booking page always has the flow.
  if (p.slug === "contact" && !sections.some((x) => x.type === "qualify")) sections = [{ type: "qualify" }, ...sections];
  if (p.slug === "contact" && !sections.some((x) => x.type === "contact")) sections = [...sections, { type: "contact" }];
  if (p.slug === "book" && !sections.some((x) => x.type === "booking")) sections = [{ type: "booking" }, ...sections];
  const needsNext = !sections.some((x) => ENDS_WITH_ACTION.has(x.type)) && !["contact", "book", "quote"].includes(p.slug);
  return (
    <main id="top">
      <section className="border-b border-[color:var(--line)] bg-[color:var(--surface)]">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
          <nav aria-label="Breadcrumb" className="text-xs text-[color:var(--muted)]"><a href={s.href("home")} className="hover:underline">Home</a> <span aria-hidden>/</span> <span aria-current="page">{p.title}</span></nav>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl" style={{ fontFamily: "var(--font-heading)" }}>{p.heading}</h1>
          {p.intro && <p className="mt-5 max-w-3xl text-lg leading-relaxed text-[color:var(--body)]">{p.intro}</p>}
        </div>
      </section>
      <Sections s={s} sections={sections} />
      {needsNext && <PrimaryCta s={s} heading={`Talk to ${c.brand.name}`} text="Tell the team what you need and they will confirm the next step." secondary={s.slugs.has("services") && p.slug !== "services" ? { label: "Explore services", target: "services" } : null} />}
      {p.sources.length > 0 && <p className="mx-auto max-w-6xl px-5 pb-10 text-xs text-[color:var(--muted)]">Based on {c.brand.name}&apos;s current page{p.sources.length > 1 ? "s" : ""}: {p.sources.map((u, i) => <span key={u}>{i ? ", " : ""}{path(u)}</span>)}</p>}
    </main>
  );
}
