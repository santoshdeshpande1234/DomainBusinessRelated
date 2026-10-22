"use client";
// Interactive demos inside a website preview. They run only in the visitor's browser: nothing typed
// or chosen here is stored or sent anywhere, and each demo says what it is.
import { useState } from "react";
import { DEMO_STATUS, type DemoStatus } from "@/lib/studio/growth";

export function DemoBadge({ status, className = "" }: { status: DemoStatus; className?: string }) {
  const tone = status === "working" ? "bg-emerald-100 text-emerald-900" : status === "simulated" ? "bg-amber-100 text-amber-950" : status === "proposed" ? "bg-sky-100 text-sky-950" : "bg-neutral-200 text-neutral-800";
  return <span title={DEMO_STATUS[status].text} className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone} ${className}`}>{DEMO_STATUS[status].label}</span>;
}

type Answer = { q: string; a: string; keys: string[] };

/** Scripted concierge: matches the question against facts on the page. Not an AI model. */
export function Assistant({ name, greeting, answers, fallback }: { name: string; greeting: string; answers: Answer[]; fallback: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [log, setLog] = useState<{ who: "you" | "bot"; text: string }[]>([{ who: "bot", text: greeting }]);
  const ask = (q: string) => {
    const t = q.trim().slice(0, 200);
    if (!t) return;
    const l = t.toLowerCase();
    const hit = answers.find((a) => a.keys.some((k) => l.includes(k)));
    setLog((x) => [...x, { who: "you" as const, text: t }, { who: "bot" as const, text: hit?.a ?? fallback }].slice(-12));
    setText("");
  };
  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 print:hidden">
      {open && (
        <div role="dialog" aria-label={`Ask ${name} (simulated demo)`} className="flex max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-white text-[color:var(--ink)] shadow-2xl ring-1 ring-neutral-200">
          <div className="flex items-center justify-between gap-2 bg-[color:var(--ink)] px-4 py-3 text-white">
            <p className="text-sm font-semibold">Ask {name}</p>
            <button type="button" onClick={() => setOpen(false)} className="rounded px-2 text-lg leading-none" aria-label="Close">×</button>
          </div>
          <p className="border-b border-neutral-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-950"><DemoBadge status="simulated" className="mr-1" /> Scripted answers from this page. Not connected to an AI model; nothing is sent.</p>
          <ul className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm" aria-live="polite">
            {log.map((m, i) => <li key={i} className={m.who === "you" ? "ml-8 rounded-2xl rounded-br-sm bg-[color:var(--accent)] px-3 py-2 text-white" : "mr-8 rounded-2xl rounded-bl-sm bg-neutral-100 px-3 py-2"}>{m.text}</li>)}
          </ul>
          <div className="flex flex-wrap gap-1.5 px-4 pb-2">
            {answers.slice(0, 4).map((a) => <button key={a.q} type="button" onClick={() => ask(a.q)} className="rounded-full border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50">{a.q}</button>)}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="flex gap-2 border-t border-neutral-200 p-3">
            <label htmlFor="pv-ask" className="sr-only">Your question</label>
            <input id="pv-ask" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Type a question…" className="min-w-0 flex-1 rounded-full border border-neutral-300 px-3 py-2 text-sm" />
            <button type="submit" className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white">Ask</button>
          </form>
        </div>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="rounded-full bg-[color:var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-lg">
        {open ? "Close" : `Ask ${name}`}
      </button>
    </div>
  );
}

/** Recommends a service from the visitor's choice. Works in the browser; nothing is sent. */
export function ServiceFinder({ question, options }: { question: string; options: { need: string; service: string; cta: string }[] }) {
  const [pick, setPick] = useState<number | null>(null);
  const o = pick == null ? null : options[pick];
  return (
    <div className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{question}</p><DemoBadge status="working" /></div>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={question}>
        {options.map((x, i) => (
          <button key={x.need} type="button" aria-pressed={pick === i} onClick={() => setPick(i)}
            className={`rounded-full border px-4 py-2 text-sm ${pick === i ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white" : "border-neutral-300 hover:bg-neutral-50"}`}>{x.need}</button>
        ))}
      </div>
      <div aria-live="polite" className="mt-4 min-h-12 text-sm">
        {o ? <p><span className="font-medium">Recommended:</span> {o.service}. <a href="#contact" className="font-medium text-[color:var(--accent)] underline">{o.cta} →</a></p>
          : <p className="text-neutral-500">Choose an option to see the recommended next step.</p>}
      </div>
    </div>
  );
}

/** The proposed qualifying enquiry. Choices stay in the browser; the result shows what would happen. */
export function QualifyForm({ cta, questions, booking, name }: { cta: string; questions: { label: string; options: string[] }[]; booking: boolean; name: string }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [sent, setSent] = useState(false);
  const urgent = Object.values(answers).some((a) => /urgent|emergency|this week|within 3 months/i.test(a));
  return (
    <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} aria-label={`${cta} (simulated demo)`} className="grid gap-4 rounded-2xl bg-white p-6 text-[color:var(--ink)]">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{cta}</p><DemoBadge status="simulated" /></div>
      {questions.map((q, i) => (
        <fieldset key={q.label} className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{q.label}</legend>
          <div className="flex flex-wrap gap-2">
            {q.options.map((o) => (
              <label key={o} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${answers[i] === o ? "border-[color:var(--accent)] bg-[color:var(--soft)]" : "border-neutral-300"}`}>
                <input type="radio" name={`q${i}`} value={o} checked={answers[i] === o} onChange={() => { setAnswers((a) => ({ ...a, [i]: o })); setSent(false); }} className="sr-only" />{o}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {booking && <><label className="text-sm font-medium" htmlFor="pv-date">Preferred date</label><input id="pv-date" type="date" className="rounded-lg border border-neutral-300 px-3 py-2" /></>}
      <label className="text-sm font-medium" htmlFor="pv-contact">Phone or email</label>
      <input id="pv-contact" disabled placeholder="Disabled in this preview" className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2" />
      <button type="submit" className="mt-1 rounded-full bg-[color:var(--accent)] px-6 py-3 font-medium text-white">{cta}</button>
      <p className="text-xs text-neutral-500">Preview only: this form is not connected and sends nothing.</p>
      {sent && (
        <div role="status" className="rounded-xl bg-[color:var(--soft)] p-4 text-sm">
          <p className="font-semibold">In the live version, this enquiry would:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>be saved as a lead with these answers{Object.keys(answers).length ? ` (${Object.values(answers).join(", ")})` : ""};</li>
            <li>be marked <strong>{urgent ? "priority" : "standard"}</strong> and routed to the {name} team;</li>
            <li>send you an instant confirmation{booking ? " and a reminder before your appointment" : ""}.</li>
          </ol>
          <p className="mt-2 text-xs text-neutral-600">Simulated: nothing was saved or sent.</p>
        </div>
      )}
    </form>
  );
}

/** Steps a real enquiry would follow, played on demand. Nothing runs. */
export function WorkflowDemo({ steps }: { steps: string[] }) {
  const [at, setAt] = useState(-1);
  const play = () => { setAt(0); steps.forEach((_, i) => setTimeout(() => setAt(i), i * 600)); };
  return (
    <div className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Automated enquiry workflow</p>
        <span className="flex items-center gap-2"><DemoBadge status="simulated" /><button type="button" onClick={play} className="rounded-full bg-[color:var(--accent)] px-4 py-1.5 text-sm font-medium text-white">Play</button></span>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s} className={`rounded-xl border p-3 text-sm transition ${i <= at ? "border-[color:var(--accent)] bg-[color:var(--soft)]" : "border-neutral-200 text-neutral-500"}`}>
            <span className="mr-2 font-semibold">{i + 1}.</span>{s}
          </li>
        ))}
      </ol>
    </div>
  );
}

const num = (s: string) => { const n = Number(s.replace(/,/g, "")); return s.trim() && Number.isFinite(n) && n >= 0 ? n : null; };

/** What-if estimate from the viewer's own numbers. No baseline is filled in for them. */
export function ImpactCalculator() {
  const [v, setV] = useState({ visits: "", rate: "", uplift: "", minutes: "", share: "" });
  const visits = num(v.visits), rate = num(v.rate), uplift = num(v.uplift), minutes = num(v.minutes), share = num(v.share);
  const now = visits != null && rate != null ? visits * (rate / 100) : null;
  const extra = now != null && uplift != null ? now * (uplift / 100) : null;
  const hours = now != null && minutes != null && share != null ? ((now + (extra ?? 0)) * minutes * (share / 100)) / 60 : null;
  // A plain function, not a component, so inputs keep focus while typing.
  const field = (k: keyof typeof v, label: string, hint: string) => (
    <label key={k} className="grid gap-1 text-sm"><span className="font-medium">{label}</span>
      <input inputMode="decimal" value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value.slice(0, 12) }))} className="rounded-lg border border-neutral-300 px-3 py-2" placeholder={hint} />
    </label>
  );
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return (
    <div className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
      <p className="font-semibold">Illustrative impact estimate</p>
      <p className="mt-1 text-xs text-neutral-500">Enter your own figures. Nothing is pre-filled because we don&apos;t know your traffic or conversion rates. Results are estimates, not promises.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {field("visits", "Monthly website visits", "e.g. from analytics")}
        {field("rate", "Visits that enquire today (%)", "your rate")}
        {field("uplift", "Assumed improvement (%)", "your assumption")}
        {field("minutes", "Staff minutes per enquiry", "today")}
        {field("share", "Share automated (%)", "your assumption")}
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-3" aria-live="polite">
        <div className="rounded-xl bg-[color:var(--soft)] p-4"><dt className="text-xs">Enquiries a month today</dt><dd className="text-2xl font-semibold">{now == null ? "—" : fmt(now)}</dd></div>
        <div className="rounded-xl bg-[color:var(--soft)] p-4"><dt className="text-xs">Estimated extra enquiries a month</dt><dd className="text-2xl font-semibold">{extra == null ? "—" : `+${fmt(extra)}`}</dd></div>
        <div className="rounded-xl bg-[color:var(--soft)] p-4"><dt className="text-xs">Estimated staff hours saved a month</dt><dd className="text-2xl font-semibold">{hours == null ? "—" : fmt(hours)}</dd></div>
      </dl>
    </div>
  );
}

export function PrintButton({ children }: { children: React.ReactNode }) {
  return <button type="button" onClick={() => window.print()} className="rounded-full border border-current px-4 py-1.5 text-sm font-medium print:hidden">{children}</button>;
}
