"use client";
// Interactive parts of a proposed website: navigation, capability explorer, enquiry form and booking
// flow. Everything runs in the visitor's browser. Forms validate for real, but a preview has no
// connection to the business, so a valid submission says plainly that nothing was sent.
import { useEffect, useId, useRef, useState } from "react";

export type NavItem = { slug: string; label: string; href: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+()\d\s.-]{7,20}$/;

/** Main navigation: up to five items inline, the rest under "More"; a menu button on small screens. */
export function SiteNav({ items, current, cta, tel, telLabel, dark }: {
  items: NavItem[]; current: string; cta: { label: string; href: string } | null; tel: string | null; telLabel: string | null; dark: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLLIElement>(null);
  const inline = items.length > 6 ? items.slice(0, 5) : items;
  const rest = items.length > 6 ? items.slice(5) : [];
  useEffect(() => {
    if (!more && !open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setMore(false); setOpen(false); } };
    const click = (e: MouseEvent) => { if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMore(false); };
    document.addEventListener("keydown", key); document.addEventListener("click", click);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("click", click); };
  }, [more, open]);
  const link = (i: NavItem, block = false) => (
    <a href={i.href} aria-current={current === i.slug ? "page" : undefined}
      className={`${block ? "block px-2 py-3 text-base" : "px-1 py-2"} rounded-[var(--r-sm)] font-medium transition-colors hover:text-[color:var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus)] ${current === i.slug ? "text-[color:var(--primary)] underline decoration-2 underline-offset-8" : ""} ${dark && !block ? "hover:text-white" : ""}`}>{i.label}</a>
  );
  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-6 text-sm lg:flex">
        <ul className="flex items-center gap-5">
          {inline.map((i) => <li key={i.slug}>{link(i)}</li>)}
          {rest.length > 0 && (
            <li ref={moreRef} className="relative">
              <button type="button" aria-expanded={more} aria-haspopup="true" onClick={() => setMore((m) => !m)} className="flex items-center gap-1 px-1 py-2 font-medium hover:text-[color:var(--primary)]">
                More <span aria-hidden className={`text-xs transition-transform ${more ? "rotate-180" : ""}`}>▾</span>
              </button>
              {more && (
                <ul className="absolute right-0 top-full z-50 mt-2 min-w-48 rounded-[var(--r-md)] border border-[color:var(--line)] bg-white p-2 text-[color:var(--ink)] shadow-lg">
                  {rest.map((i) => <li key={i.slug}>{link(i, true)}</li>)}
                </ul>
              )}
            </li>
          )}
        </ul>
        {tel && <a href={tel} className="text-sm font-medium opacity-80 hover:opacity-100">{telLabel}</a>}
        {cta && <a href={cta.href} className="rounded-[var(--r-btn)] bg-[color:var(--accent)] px-5 py-2.5 font-semibold text-[color:var(--on-accent)] shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus)] active:translate-y-px">{cta.label}</a>}
      </nav>
      <button type="button" aria-expanded={open} aria-controls="site-mobile-nav" onClick={() => setOpen((o) => !o)}
        className="rounded-[var(--r-sm)] border border-current/30 px-3 py-2 text-sm font-medium lg:hidden">{open ? "Close" : "Menu"}</button>
      {open && (
        <div id="site-mobile-nav" className="absolute inset-x-0 top-full z-50 border-b border-[color:var(--line)] bg-white px-5 pb-6 pt-2 text-[color:var(--ink)] shadow-lg lg:hidden">
          <nav aria-label="Main (mobile)"><ul className="divide-y divide-[color:var(--line)]">{items.map((i) => <li key={i.slug}>{link(i, true)}</li>)}</ul></nav>
          <div className="mt-4 grid gap-2">
            {cta && <a href={cta.href} className="rounded-[var(--r-btn)] bg-[color:var(--accent)] px-5 py-3 text-center font-semibold text-[color:var(--on-accent)]">{cta.label}</a>}
            {tel && <a href={tel} className="rounded-[var(--r-btn)] border border-[color:var(--line)] px-5 py-3 text-center font-medium">Call {telLabel}</a>}
          </div>
        </div>
      )}
    </>
  );
}

export type Capability = { label: string; detail: string | null; href: string | null; ask: string };

/** Turns a list of capabilities into tabs: pick one to see what it is and where to go next. */
export function CapabilityExplorer({ heading, items, name }: { heading: string | null; items: Capability[]; name: string }) {
  const [at, setAt] = useState(0);
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const c = items[at];
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === "ArrowDown" || e.key === "ArrowRight" ? (i + 1) % items.length : e.key === "ArrowUp" || e.key === "ArrowLeft" ? (i - 1 + items.length) % items.length : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : -1;
    if (n < 0) return;
    e.preventDefault(); setAt(n); tabs.current[n]?.focus();
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div role="tablist" aria-label={heading ?? `What ${name} offers`} aria-orientation="vertical" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {items.map((x, i) => (
          <button key={x.label} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`${id}-t${i}`} aria-selected={i === at} aria-controls={`${id}-p`} tabIndex={i === at ? 0 : -1}
            onClick={() => setAt(i)} onKeyDown={(e) => onKey(e, i)}
            className={`shrink-0 rounded-[var(--r-md)] border px-4 py-3 text-left text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus)] lg:w-full ${i === at ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-[color:var(--on-primary)] shadow-sm" : "border-[color:var(--line)] bg-white hover:border-[color:var(--primary)]"}`}>
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-p`} aria-labelledby={`${id}-t${at}`} tabIndex={0} className="rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--surface)] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--primary)]">{heading ?? "Capability"}</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>{c.label}</h3>
        <p className="mt-3 leading-relaxed text-[color:var(--body)]">{c.detail ?? `Ask ${name} how ${c.label} fits what you need; the team will explain the options.`}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {c.href && <a href={c.href} className="rounded-[var(--r-btn)] bg-[color:var(--primary)] px-5 py-2.5 text-sm font-semibold text-[color:var(--on-primary)] transition hover:bg-[color:var(--primary-hover)]">Explore {c.label}</a>}
          <a href={c.ask} className={`rounded-[var(--r-btn)] px-5 py-2.5 text-sm font-semibold transition ${c.href ? "border border-[color:var(--line)] bg-white hover:border-[color:var(--primary)]" : "bg-[color:var(--primary)] text-[color:var(--on-primary)] hover:bg-[color:var(--primary-hover)]"}`}>Ask about {c.label}</a>
        </div>
      </div>
    </div>
  );
}

type Errors = Partial<Record<"name" | "contact" | "message" | "date" | "time" | "topic", string>>;
const contactError = (v: string) => (!v.trim() ? "Enter an email address or phone number." : EMAIL.test(v.trim()) || PHONE.test(v.trim()) ? undefined : "That doesn't look like an email address or phone number.");

/** Reads ?topic= from the address, so a "Ask about X" link arrives with X selected. */
function useTopic(options: string[]): [string, (t: string) => void] {
  const [topic, setTopic] = useState("");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("topic")?.slice(0, 80) ?? "";
    if (t) setTopic(options.find((o) => o.toLowerCase() === t.toLowerCase()) ?? t);
  }, [options]);
  return [topic, setTopic];
}

function NotSent({ name, summary, alt }: { name: string; summary: string[]; alt: React.ReactNode }) {
  return (
    <div role="status" className="rounded-[var(--r-md)] border border-[color:var(--warning)]/30 bg-[color:var(--surface)] p-5 text-sm">
      <p className="font-semibold">Everything checks out, but this preview did not send anything.</p>
      <p className="mt-1 text-[color:var(--body)]">On the live website this would reach the {name} team, and you would get a confirmation by email or text. Nothing was saved or sent.</p>
      <ul className="mt-3 list-disc space-y-0.5 pl-5 text-[color:var(--muted)]">{summary.map((s) => <li key={s}>{s}</li>)}</ul>
      <div className="mt-3">{alt}</div>
    </div>
  );
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-[color:var(--muted)]">{hint}</p>}
      {error && <p id={`${id}-err`} className="text-xs font-medium text-[color:var(--error)]">{error}</p>}
    </div>
  );
}
const input = (bad?: string) => `w-full rounded-[var(--r-sm)] border bg-white px-3 py-2.5 text-[color:var(--ink)] outline-none transition focus:border-[color:var(--primary)] focus:ring-2 focus:ring-[color:var(--focus)]/40 ${bad ? "border-[color:var(--error)]" : "border-[color:var(--line)]"}`;

/** Enquiry form with real validation. Submitting a valid form explains that the preview sends nothing. */
export function EnquiryForm({ name, cta, topics, questions, alt, compact = false }: {
  name: string; cta: string; topics: string[]; questions: { label: string; options: string[] }[]; alt: React.ReactNode; compact?: boolean;
}) {
  const id = useId();
  const [topic, setTopic] = useTopic(topics);
  const [v, setV] = useState({ name: "", contact: "", message: "" });
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState<string[] | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err: Errors = { name: v.name.trim() ? undefined : "Enter your name.", contact: contactError(v.contact), message: v.message.length > 1000 ? "Keep the message under 1,000 characters." : undefined };
    setErrors(err);
    if (Object.values(err).some(Boolean)) { setDone(null); return; }
    setDone([`Name: ${v.name.trim()}`, `Reply to: ${v.contact.trim()}`, ...(topic ? [`About: ${topic}`] : []), ...Object.values(answers).map((a) => `Answer: ${a}`), ...(v.message.trim() ? ["With your message"] : [])]);
  };
  return (
    <form noValidate onSubmit={submit} aria-label={cta} className={`grid gap-4 ${compact ? "" : "rounded-[var(--r-lg)] border border-[color:var(--line)] bg-white p-6 shadow-sm sm:p-8"} text-[color:var(--ink)]`}>
      {!compact && <p className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)" }}>{cta}</p>}
      {topics.length > 0 && (
        <Field id={`${id}-topic`} label="What is it about?">
          <select id={`${id}-topic`} value={topic} onChange={(e) => setTopic(e.target.value)} className={input()}>
            <option value="">Choose one (optional)</option>
            {[...new Set([...topics, ...(topic && !topics.includes(topic) ? [topic] : [])])].map((t) => <option key={t} value={t}>{t}</option>)}
            <option value="Something else">Something else</option>
          </select>
        </Field>
      )}
      {!compact && questions.map((q, i) => (
        <fieldset key={q.label} className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{q.label} <span className="font-normal text-[color:var(--muted)]">(optional)</span></legend>
          <div className="flex flex-wrap gap-2">
            {q.options.map((o) => (
              <label key={o} className={`cursor-pointer rounded-[var(--r-btn)] border px-3 py-1.5 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[color:var(--focus)] ${answers[i] === o ? "border-[color:var(--primary)] bg-[color:var(--surface-alt)]" : "border-[color:var(--line)] hover:border-[color:var(--primary)]"}`}>
                <input type="radio" name={`${id}-q${i}`} value={o} checked={answers[i] === o} onChange={() => setAnswers((a) => ({ ...a, [i]: o }))} className="sr-only" />{o}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div className={`grid gap-4 ${compact ? "" : "sm:grid-cols-2"}`}>
        <Field id={`${id}-name`} label="Your name" error={errors.name}>
          <input id={`${id}-name`} autoComplete="name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value.slice(0, 80) })} aria-invalid={!!errors.name} aria-describedby={errors.name ? `${id}-name-err` : undefined} className={input(errors.name)} />
        </Field>
        <Field id={`${id}-contact`} label="Email or phone" error={errors.contact}>
          <input id={`${id}-contact`} autoComplete="email" value={v.contact} onChange={(e) => setV({ ...v, contact: e.target.value.slice(0, 80) })} aria-invalid={!!errors.contact} aria-describedby={errors.contact ? `${id}-contact-err` : undefined} className={input(errors.contact)} />
        </Field>
      </div>
      {!compact && (
        <Field id={`${id}-msg`} label="Message (optional)" error={errors.message}>
          <textarea id={`${id}-msg`} rows={4} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value.slice(0, 1200) })} aria-invalid={!!errors.message} className={input(errors.message)} />
        </Field>
      )}
      <button type="submit" className="rounded-[var(--r-btn)] bg-[color:var(--accent)] px-6 py-3 font-semibold text-[color:var(--on-accent)] shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus)] active:translate-y-px">{cta}</button>
      <p className="text-xs text-[color:var(--muted)]">Your details would be used only to reply to this enquiry. Preview: nothing is sent.</p>
      <div aria-live="polite">{done && <NotSent name={name} summary={done} alt={alt} />}</div>
    </form>
  );
}

const SLOTS = ["Morning (9–12)", "Afternoon (12–4)", "Late afternoon (4–6)"];

/** Booking request: service, a preferred day and time window, contact details, then a review step. */
export function BookingFlow({ name, cta, services, alt }: { name: string; cta: string; services: string[]; alt: React.ReactNode }) {
  const id = useId();
  const [topic, setTopic] = useTopic(services);
  const [step, setStep] = useState(services.length ? 0 : 1);
  const [days, setDays] = useState<{ iso: string; label: string }[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [v, setV] = useState({ name: "", contact: "", note: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState<string[] | null>(null);
  const head = useRef<HTMLHeadingElement>(null);
  // Next ten weekdays, from the visitor's own clock (rendered after mount so server and browser agree).
  useEffect(() => {
    const out: { iso: string; label: string }[] = [];
    const d = new Date(); d.setHours(12, 0, 0, 0);
    while (out.length < 10) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) out.push({ iso: d.toISOString().slice(0, 10), label: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) }); }
    setDays(out);
  }, []);
  useEffect(() => { head.current?.focus(); }, [step]);
  const steps = [...(services.length ? ["Service"] : []), "Day and time", "Your details", "Review"];
  const idx = services.length ? step : step - 1;
  const next = () => {
    if (step === 1) {
      const err: Errors = { date: date ? undefined : "Choose a day.", time: time ? undefined : "Choose a time window." };
      setErrors(err); if (err.date || err.time) return;
    }
    if (step === 2) {
      const err: Errors = { name: v.name.trim() ? undefined : "Enter your name.", contact: contactError(v.contact) };
      setErrors(err); if (err.name || err.contact) return;
    }
    setErrors({}); setStep((s) => s + 1);
  };
  const dayLabel = days.find((d) => d.iso === date)?.label ?? date;
  return (
    <div className="rounded-[var(--r-lg)] border border-[color:var(--line)] bg-white p-6 text-[color:var(--ink)] shadow-sm sm:p-8">
      <ol className="mb-6 flex flex-wrap gap-2 text-xs font-medium" aria-label="Booking steps">
        {steps.map((s, i) => <li key={s} aria-current={i === idx ? "step" : undefined} className={`rounded-full px-3 py-1 ${i === idx ? "bg-[color:var(--primary)] text-[color:var(--on-primary)]" : i < idx ? "bg-[color:var(--surface-alt)]" : "bg-[color:var(--surface)] text-[color:var(--muted)]"}`}>{i + 1}. {s}</li>)}
      </ol>
      <h3 ref={head} tabIndex={-1} className="text-xl font-semibold outline-none" style={{ fontFamily: "var(--font-heading)" }}>
        {step === 0 ? "What would you like to book?" : step === 1 ? "When suits you?" : step === 2 ? "Where should the team reply?" : done ? "Request checked" : "Check your request"}
      </h3>
      {step === 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Service">
          {services.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={topic === s} onClick={() => { setTopic(s); setStep(1); }}
              className={`rounded-[var(--r-md)] border px-4 py-3 text-left text-sm font-medium transition hover:border-[color:var(--primary)] ${topic === s ? "border-[color:var(--primary)] bg-[color:var(--surface-alt)]" : "border-[color:var(--line)]"}`}>{s}</button>
          ))}
          <button type="button" onClick={() => { setTopic("Not sure yet"); setStep(1); }} className="rounded-[var(--r-md)] border border-dashed border-[color:var(--line)] px-4 py-3 text-left text-sm">Not sure yet</button>
        </div>
      )}
      {step === 1 && (
        <div className="mt-4 grid gap-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Preferred day</legend>
            <div className="flex flex-wrap gap-2">
              {days.map((d) => <button key={d.iso} type="button" aria-pressed={date === d.iso} onClick={() => setDate(d.iso)} className={`rounded-[var(--r-sm)] border px-3 py-2 text-sm transition ${date === d.iso ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-[color:var(--on-primary)]" : "border-[color:var(--line)] hover:border-[color:var(--primary)]"}`}>{d.label}</button>)}
            </div>
            {errors.date && <p className="mt-1 text-xs font-medium text-[color:var(--error)]">{errors.date}</p>}
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Time window</legend>
            <div className="flex flex-wrap gap-2">
              {SLOTS.map((t) => <button key={t} type="button" aria-pressed={time === t} onClick={() => setTime(t)} className={`rounded-[var(--r-sm)] border px-3 py-2 text-sm transition ${time === t ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-[color:var(--on-primary)]" : "border-[color:var(--line)] hover:border-[color:var(--primary)]"}`}>{t}</button>)}
            </div>
            {errors.time && <p className="mt-1 text-xs font-medium text-[color:var(--error)]">{errors.time}</p>}
            <p className="mt-2 text-xs text-[color:var(--muted)]">This is a requested time. {name} confirms the exact slot.</p>
          </fieldset>
        </div>
      )}
      {step === 2 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id={`${id}-n`} label="Your name" error={errors.name}><input id={`${id}-n`} autoComplete="name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value.slice(0, 80) })} aria-invalid={!!errors.name} className={input(errors.name)} /></Field>
          <Field id={`${id}-c`} label="Email or phone" error={errors.contact}><input id={`${id}-c`} autoComplete="email" value={v.contact} onChange={(e) => setV({ ...v, contact: e.target.value.slice(0, 80) })} aria-invalid={!!errors.contact} className={input(errors.contact)} /></Field>
          <div className="sm:col-span-2"><Field id={`${id}-x`} label="Anything the team should know? (optional)"><textarea id={`${id}-x`} rows={3} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value.slice(0, 600) })} className={input()} /></Field></div>
        </div>
      )}
      {step === 3 && (
        <div className="mt-4 grid gap-4">
          <dl className="grid gap-2 rounded-[var(--r-md)] bg-[color:var(--surface)] p-4 text-sm sm:grid-cols-2">
            {topic && <div><dt className="text-[color:var(--muted)]">Service</dt><dd className="font-medium">{topic}</dd></div>}
            <div><dt className="text-[color:var(--muted)]">Requested</dt><dd className="font-medium">{dayLabel}, {time}</dd></div>
            <div><dt className="text-[color:var(--muted)]">Name</dt><dd className="font-medium">{v.name}</dd></div>
            <div><dt className="text-[color:var(--muted)]">Reply to</dt><dd className="font-medium">{v.contact}</dd></div>
          </dl>
          {!done && <button type="button" onClick={() => setDone([`${topic || "Booking"} on ${dayLabel}, ${time}`, `Reply to ${v.contact}`])} className="rounded-[var(--r-btn)] bg-[color:var(--accent)] px-6 py-3 font-semibold text-[color:var(--on-accent)] shadow-sm transition hover:brightness-110">{cta}</button>}
          <div aria-live="polite">{done && <NotSent name={name} summary={done} alt={alt} />}</div>
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        {step > (services.length ? 0 : 1) && !done ? <button type="button" onClick={() => { setErrors({}); setStep((s) => s - 1); }} className="text-sm font-medium underline underline-offset-4">Back</button> : <span />}
        {(step === 1 || step === 2) && <button type="button" onClick={next} className="rounded-[var(--r-btn)] bg-[color:var(--primary)] px-5 py-2.5 text-sm font-semibold text-[color:var(--on-primary)] transition hover:bg-[color:var(--primary-hover)]">Continue</button>}
      </div>
      <div className="mt-4 border-t border-[color:var(--line)] pt-4 text-xs text-[color:var(--muted)]">Prefer not to book online? {alt}</div>
    </div>
  );
}

/** An image from their own site that disappears cleanly if it can't load. */
export function SafeImg({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [ok, setOk] = useState(true);
  // eslint-disable-next-line @next/next/no-img-element -- their own image, loaded from their site
  return ok ? <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setOk(false)} className={className} /> : null;
}
