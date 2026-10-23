// Client-facing growth plan: what is missing today, how the proposed site differs, and which Growth
// Engines address it. Reads only content.growth (the client-safe part of the plan): no competitor
// names, scores, prices or internal notes. Suitable for presenting on a sales call or printing.
import type { SiteContent } from "@/lib/studio/site";
import { DEMO_STATUS, type DemoStatus } from "@/lib/studio/growth";
import { DemoBadge, ImpactCalculator, PrintButton, WorkflowDemo } from "@/components/preview-demos";

const BASIS = { observed: "Observed on your site", competitor: "Observed; common nearby", industry: "Industry recommendation" } as const;
const TODAY = { yes: "In place", no: "Missing", unknown: "Not verified" } as const;
const POS = { ahead: ["Ahead", "bg-emerald-100 text-emerald-900"], level: ["Level", "bg-neutral-200 text-neutral-700"], behind: ["Behind", "bg-rose-100 text-rose-900"], open: ["Open ground", "bg-sky-100 text-sky-900"], unknown: ["Not compared", "bg-neutral-200 text-neutral-700"] } as const;
const READY = { ready: "Ready", partly: "Partly ready", "not yet": "Not ready yet", unknown: "Not assessed" } as const;

export function GrowthPlanView({ c, owner, siteHref }: { c: SiteContent; owner: string; siteHref: string }) {
  const g = c.growth!;
  const primary = g.engines.filter((e) => e.primary);
  const rest = g.engines.filter((e) => !e.primary);
  const steps = [
    `A visitor ${c.booking ? "requests a booking" : "sends an enquiry"} on the website`,
    "Their answers qualify the enquiry and a CRM lead is created",
    `The enquiry is routed to the right person at ${c.brand.name}`,
    "The visitor gets an instant confirmation",
    "The team gets an alert and a follow-up reminder",
    "The outcome is tracked against the KPIs below",
  ];
  const statuses = Object.keys(DEMO_STATUS) as DemoStatus[];
  const pos = g.position;

  return (
    <main className="bg-white">
      <section className="bg-[color:var(--ink)] text-white">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-wider opacity-80">Growth plan for {c.brand.name}{g.segment ? ` · for ${g.segment}` : ""}</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{g.headline}</h1>
          <p className="mt-5 max-w-3xl text-lg opacity-90">{g.positioning}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href={siteHref} className="rounded-full bg-white px-6 py-3 font-medium text-[color:var(--ink)]">See the proposed website</a>
            <PrintButton>Print or save as PDF</PrintButton>
          </div>
        </div>
      </section>

      {pos && (pos.dimensions.length > 0 || pos.capabilities.length > 0) && (
        <section className="mx-auto max-w-6xl px-5 py-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-[color:var(--accent)]">Competitive position</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{pos.headline ?? `Where ${c.brand.name} can stand out`}</h2>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">{pos.note}</p>
          {pos.dimensions.length > 0 && (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pos.dimensions.map((d) => (
                <li key={d.name} className="rounded-2xl p-5 ring-1 ring-neutral-200">
                  <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{d.name}</h3><span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${POS[d.position][1]}`}>{POS[d.position][0]}</span></div>
                  <p className="mt-1 text-xs text-neutral-500">{d.question}</p>
                  <ul className="mt-3 space-y-1.5 text-sm text-neutral-700">{d.points.map((x) => <li key={x}>{x}</li>)}</ul>
                </li>
              ))}
            </ul>
          )}
          {pos.capabilities.length > 0 && (
            <div className="mt-10">
              <h3 className="text-xl font-semibold tracking-tight">Capabilities to build, most likely to pay off first</h3>
              <ol className="mt-4 grid gap-4 lg:grid-cols-2">
                {pos.capabilities.map((k, i) => (
                  <li key={k.name} className="rounded-2xl bg-[color:var(--soft)] p-5">
                    <p className="font-semibold">{i + 1}. {k.name}</p>
                    <p className="mt-1 text-sm text-neutral-700">{k.reason}</p>
                    <ul className="mt-3 space-y-2 text-sm">
                      {k.implementations.map((m) => <li key={m.text}><span className="font-medium">{m.text}</span> <span className="text-xs text-neutral-500">({m.likelihood} likelihood · measured by {m.kpi.toLowerCase()})</span></li>)}
                    </ul>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Today and with the new website</h2>
        <p className="mt-2 text-sm text-neutral-600">From a check of the current home page. Anything we could not see from outside is marked as not verified.</p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead><tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500"><th className="py-2 pr-4 font-medium">Capability</th><th className="py-2 pr-4 font-medium">Today</th><th className="py-2 font-medium">Proposed</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {g.today.map((r) => (
                <tr key={r.label}>
                  <td className="py-3 pr-4 font-medium">{r.label}</td>
                  <td className="py-3 pr-4"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.today === "yes" ? "bg-emerald-100 text-emerald-900" : r.today === "no" ? "bg-rose-100 text-rose-900" : "bg-neutral-200 text-neutral-700"}`}>{TODAY[r.today]}</span></td>
                  <td className="py-3">{r.proposed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-[color:var(--soft)]">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-[color:var(--accent)]">Our services</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Growth Engines for {c.brand.name}</h2>
          <p className="mt-2 max-w-3xl text-neutral-700">Each engine is a business outcome, delivered through the website, AI, integrations and automation. These are the ones your gaps call for, strongest first.</p>
          <ul className="mt-8 grid gap-5 lg:grid-cols-3">
            {primary.map((e, i) => (
              <li key={e.key} className="flex flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--accent)]">Priority {i + 1}</span>
                <h3 className="mt-1 text-lg font-semibold">{e.name}</h3>
                <p className="mt-1 text-sm text-neutral-600">{e.outcome}</p>
                <ul className="mt-4 space-y-2 text-sm">{e.points.map((p) => <li key={p} className="flex gap-2"><span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[color:var(--accent)]" />{p}</li>)}</ul>
                {e.kpis.length > 0 && <p className="mt-auto pt-4 text-xs text-neutral-500">Measured by: {e.kpis.join("; ")}</p>}
              </li>
            ))}
          </ul>
          {rest.length > 0 && (
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {rest.map((e) => <li key={e.key} className="rounded-2xl bg-white/70 p-5 ring-1 ring-neutral-200"><h3 className="font-semibold">{e.name}</h3><p className="mt-1 text-sm text-neutral-600">{e.outcome}</p></li>)}
            </ul>
          )}
          <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-white p-6">
            <h3 className="font-semibold">The foundation: your new website</h3>
            <p className="mt-1 text-sm text-neutral-600">The website is what every engine runs on, not the end product.</p>
            <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{g.foundation.map((f) => <li key={f}>✓ {f}</li>)}</ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">From gap to growth</h2>
        <p className="mt-2 text-sm text-neutral-600">Each gap, what we recommend, how it helps your {g.customers}, and how we would measure it.</p>
        <ol className="mt-6 grid gap-4 lg:grid-cols-2">
          {g.gaps.map((x) => (
            <li key={x.gap} className="rounded-2xl p-5 ring-1 ring-neutral-200">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2.5 py-0.5 font-semibold ${x.priority === "high" ? "bg-[color:var(--accent)] text-white" : "bg-neutral-100"}`}>{x.priority} priority</span>
                <span className="text-neutral-500">{BASIS[x.basis]}</span>
              </div>
              <h3 className="mt-2 font-semibold">{x.gap}</h3>
              <p className="mt-1 text-sm text-neutral-600">{x.why}</p>
              <dl className="mt-3 grid gap-1.5 text-sm">
                <div><dt className="inline font-medium">Recommendation: </dt><dd className="inline">{x.solution}</dd></div>
                <div><dt className="inline font-medium">Growth Engine: </dt><dd className="inline">{x.engine}</dd></div>
                {x.automation !== "—" && <div><dt className="inline font-medium">AI / automation: </dt><dd className="inline">{x.automation}</dd></div>}
                <div><dt className="inline font-medium">For your {g.customers}: </dt><dd className="inline">{x.benefit}</dd></div>
                <div><dt className="inline font-medium">KPI: </dt><dd className="inline">{x.kpi}</dd></div>
              </dl>
            </li>
          ))}
        </ol>
      </section>

      {!pos?.dimensions.length && (g.differentiation.length > 0 || g.strengths.length > 0) && (
        <section className="bg-neutral-50">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Standing out locally</h2>
            <p className="mt-2 text-sm text-neutral-600">From comparing public websites of nearby businesses.</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">{[...g.strengths, ...g.differentiation].map((d) => <li key={d} className="rounded-2xl bg-white p-5 text-sm ring-1 ring-neutral-200">{d}</li>)}</ul>
          </div>
        </section>
      )}

      {pos && pos.outlook.length > 0 && (
        <section className="bg-neutral-50">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Preparing for the next five years</h2>
            <p className="mt-2 text-sm text-neutral-600">Where the industry is heading, as an outlook rather than a forecast, and how ready {c.brand.name} looks today.</p>
            <ul className="mt-6 grid gap-4 lg:grid-cols-2">
              {pos.outlook.map((o) => (
                <li key={o.trend} className="rounded-2xl bg-white p-5 ring-1 ring-neutral-200">
                  <div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-neutral-500">{o.horizon}</span><span className="rounded-full bg-neutral-100 px-2.5 py-0.5 font-semibold">{READY[o.readiness]}</span></div>
                  <h3 className="mt-2 font-semibold">{o.trend}</h3>
                  <p className="mt-1 text-sm text-neutral-600">{o.implication}</p>
                  <p className="mt-2 text-sm"><span className="font-medium">How to prepare: </span>{o.prepare}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl space-y-6 px-5 py-14">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">AI and automation, honestly labelled</h2>
          <p className="mt-2 text-sm text-neutral-600">What you can try in this preview, and what needs your systems or approval first.</p>
        </div>
        <WorkflowDemo steps={steps} />
        <ul className="grid gap-3 sm:grid-cols-2">
          {g.capabilities.map((k) => <li key={k.name} className="flex flex-col gap-1.5 rounded-2xl p-4 ring-1 ring-neutral-200"><span className="flex flex-wrap items-center gap-2 font-medium">{k.name}<DemoBadge status={k.status} /></span><span className="text-sm text-neutral-600">{k.note}</span></li>)}
        </ul>
        <dl className="grid gap-2 text-xs text-neutral-600 sm:grid-cols-2">{statuses.map((s) => <div key={s}><dt className="inline font-semibold">{DEMO_STATUS[s].label}: </dt><dd className="inline">{DEMO_STATUS[s].text}</dd></div>)}</dl>
      </section>

      <section className="bg-[color:var(--soft)]">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Suggested rollout</h2>
            <ol className="mt-5 space-y-4">
              {g.rollout.map((p) => <li key={p.title} className="rounded-2xl bg-white p-5 ring-1 ring-neutral-200"><p className="font-semibold">{p.title}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{p.items.map((i) => <li key={i}>{i}</li>)}</ul></li>)}
            </ol>
          </div>
          <div className="space-y-6">
            <div><h2 className="text-2xl font-semibold tracking-tight">KPIs to track</h2><ul className="mt-4 grid gap-2 text-sm">{g.kpis.map((k) => <li key={k} className="rounded-xl bg-white px-4 py-2.5 ring-1 ring-neutral-200">{k}</li>)}</ul></div>
            {g.dependencies.length > 0 && <div><h2 className="text-xl font-semibold tracking-tight">What we would need from you</h2><ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{g.dependencies.map((d) => <li key={d}>{d}</li>)}</ul></div>}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14"><ImpactCalculator /></section>

      <section className="bg-[color:var(--ink)] text-white">
        <div className="mx-auto max-w-6xl px-5 py-14 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Next step</h2>
          <p className="mx-auto mt-3 max-w-2xl opacity-90">A short discovery call with {owner} to confirm your priorities, check what your current systems can connect to, and agree on Phase 1.</p>
        </div>
      </section>
      <footer className="px-5 py-6 text-center text-xs text-neutral-500">Prepared by {owner} for {c.brand.name}. Estimates are illustrative; no results are guaranteed.</footer>
    </main>
  );
}
