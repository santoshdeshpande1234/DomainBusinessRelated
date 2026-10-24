// The client-facing proposal, laid out for screen and print (A4). Shows only the proposal content; internal
// checks, evidence and competitor names never reach it.
import type { Proposal } from "@/lib/proposals/proposal";
import { money } from "@/lib/format";

const TODAY: Record<string, string> = { yes: "Yes", no: "No", unknown: "Not checked" };
const date = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function H({ n, children }: { n: number; children: React.ReactNode }) {
  return <h2 className="mt-10 flex items-baseline gap-3 border-b border-neutral-200 pb-2 text-lg font-semibold text-neutral-900 break-after-avoid"><span className="text-sm tabular-nums text-neutral-400">{String(n).padStart(2, "0")}</span>{children}</h2>;
}

export function ProposalDocument({ p }: { p: Proposal }) {
  const $ = (n: number | null) => (n == null ? "To be confirmed" : money(n, p.currency, { maximumFractionDigits: 0 }));
  let n = 0;
  return (
    <article className="proposal mx-auto max-w-3xl bg-white text-[15px] leading-relaxed text-neutral-700">
      <header className="border-b-4 border-neutral-900 pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{p.prepared_by.company}{p.prepared_by.website ? ` · ${p.prepared_by.website}` : ""}</p>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-neutral-900">{p.title}</h1>
        <dl className="mt-6 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-neutral-500">Prepared for</dt><dd className="font-medium text-neutral-900">{p.prepared_for.name}{p.prepared_for.contact ? `, attention ${p.prepared_for.contact}` : ""}</dd></div>
          <div><dt className="text-neutral-500">Prepared by</dt><dd className="font-medium text-neutral-900">{[p.prepared_by.sender, p.prepared_by.company].filter(Boolean).join(", ")}</dd></div>
          <div><dt className="text-neutral-500">Date</dt><dd className="font-medium text-neutral-900">{date(p.date)}</dd></div>
          <div><dt className="text-neutral-500">Valid until</dt><dd className="font-medium text-neutral-900">{date(p.valid_until)}</dd></div>
        </dl>
      </header>

      <H n={++n}>Summary</H>
      <p className="mt-4 text-base text-neutral-800">{p.summary}</p>
      {p.preview.url && <p className="mt-4 rounded-md bg-neutral-50 p-4 text-sm">{p.preview.note} <a href={p.preview.url} className="font-medium text-neutral-900 underline underline-offset-2">{p.preview.url}</a></p>}

      {(p.situation.points.length > 0 || p.situation.today.length > 0) && <>
        <H n={++n}>Where {p.prepared_for.name} is today</H>
        {p.situation.headline && <p className="mt-4 font-medium text-neutral-900">{p.situation.headline}</p>}
        {p.situation.points.length > 0 && <ul className="mt-3 list-disc space-y-1.5 pl-5">{p.situation.points.map((x) => <li key={x}>{x}</li>)}</ul>}
        {p.situation.today.length > 0 && (
          <table className="mt-5 w-full text-sm">
            <thead><tr className="border-b border-neutral-200 text-left text-neutral-500"><th className="py-2 pr-3 font-medium">Capability</th><th className="py-2 pr-3 font-medium">Today</th><th className="py-2 font-medium">Proposed</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">{p.situation.today.map((t) => <tr key={t.label} className="break-inside-avoid"><td className="py-2 pr-3 text-neutral-900">{t.label}</td><td className="py-2 pr-3">{TODAY[t.today]}</td><td className="py-2">{t.proposed}</td></tr>)}</tbody>
          </table>
        )}
      </>}

      {p.objectives.length > 0 && <><H n={++n}>Objectives</H><ul className="mt-4 list-disc space-y-1.5 pl-5">{p.objectives.map((x) => <li key={x}>{x}</li>)}</ul></>}

      {p.recommendation.engines.length > 0 && <>
        <H n={++n}>What we recommend</H>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {p.recommendation.engines.map((e) => (
            <section key={e.name} className="break-inside-avoid rounded-md border border-neutral-200 p-4">
              <h3 className="font-semibold text-neutral-900">{e.name}</h3>
              <p className="mt-1 text-sm">{e.outcome}</p>
              {e.points.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">{e.points.map((x) => <li key={x}>{x}</li>)}</ul>}
            </section>
          ))}
        </div>
        {p.recommendation.foundation.length > 0 && <p className="mt-4 text-sm"><span className="font-medium text-neutral-900">Website foundation: </span>{p.recommendation.foundation.join("; ")}.</p>}
      </>}

      {p.scope.length > 0 && <>
        <H n={++n}>Scope</H>
        <table className="mt-4 w-full text-sm">
          <thead><tr className="border-b border-neutral-200 text-left text-neutral-500"><th className="py-2 pr-3 font-medium">Deliverable</th><th className="py-2 pr-3 font-medium">What it does</th><th className="py-2 font-medium">Status</th></tr></thead>
          <tbody className="divide-y divide-neutral-100">{p.scope.map((s) => <tr key={s.item} className="break-inside-avoid"><td className="py-2 pr-3 font-medium text-neutral-900">{s.item}</td><td className="py-2 pr-3">{s.detail}</td><td className="whitespace-nowrap py-2">{s.status === "included" ? "Included" : s.status === "needs integration" ? "Needs your accounts" : "Proposed"}</td></tr>)}</tbody>
        </table>
      </>}

      {p.rollout.length > 0 && <>
        <H n={++n}>Rollout</H>
        <ol className="mt-4 space-y-3">{p.rollout.map((r) => <li key={r.title} className="break-inside-avoid"><p className="font-medium text-neutral-900">{r.title}</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{r.items.map((x) => <li key={x}>{x}</li>)}</ul></li>)}</ol>
      </>}

      <H n={++n}>Investment</H>
      <table className="mt-4 w-full text-sm">
        <tbody className="divide-y divide-neutral-100">
          {p.investment.lines.map((l) => <tr key={l.key} className="break-inside-avoid"><td className="py-3 pr-3"><span className="font-medium text-neutral-900">{l.label}</span><span className="block text-neutral-500">{l.detail}</span></td><td className="whitespace-nowrap py-3 text-right font-medium tabular-nums text-neutral-900">{$(l.amount)}{l.amount != null && l.recurring === "monthly" ? " / month" : ""}</td></tr>)}
        </tbody>
        <tfoot className="border-t-2 border-neutral-900 text-neutral-900">
          <tr><td className="pt-3">One-time</td><td className="pt-3 text-right font-semibold tabular-nums">{$(p.investment.one_time)}</td></tr>
          <tr><td>Monthly</td><td className="text-right font-semibold tabular-nums">{$(p.investment.monthly)}</td></tr>
          <tr><td>First year in total</td><td className="text-right font-semibold tabular-nums">{$(p.investment.first_year)}</td></tr>
        </tfoot>
      </table>
      <p className="mt-3 text-xs text-neutral-500">{p.investment.note}</p>

      <H n={++n}>Expected impact</H>
      {p.impact.available ? <>
        <table className="mt-4 w-full text-sm">
          <thead><tr className="border-b border-neutral-200 text-left text-neutral-500"><th className="py-2 pr-3 font-medium">Scenario</th><th className="py-2 pr-3 text-right font-medium">Extra revenue a year</th><th className="py-2 pr-3 text-right font-medium">First-year net</th><th className="py-2 pr-3 text-right font-medium">ROI</th><th className="py-2 text-right font-medium">Payback</th></tr></thead>
          <tbody className="divide-y divide-neutral-100">{p.impact.scenarios.map((s) => <tr key={s.label}><td className="py-2 pr-3 text-neutral-900">{s.label}</td><td className="py-2 pr-3 text-right tabular-nums">{$(s.revenue_year)}</td><td className="py-2 pr-3 text-right tabular-nums">{$(s.first_year_net)}</td><td className="py-2 pr-3 text-right tabular-nums">{s.roi == null ? "—" : `${Math.round(s.roi * 100)}%`}</td><td className="py-2 text-right tabular-nums">{s.payback_month == null ? "Beyond 12 months" : `Month ${s.payback_month}`}</td></tr>)}</tbody>
        </table>
        <p className="mt-3 text-xs text-neutral-500">{p.impact.note}</p>
      </> : <p className="mt-4 text-sm">{p.impact.note}</p>}

      {p.kpis.length > 0 && <><H n={++n}>How we&apos;ll measure progress</H><ul className="mt-4 grid list-disc gap-x-8 gap-y-1 pl-5 text-sm sm:grid-cols-2">{p.kpis.map((x) => <li key={x}>{x}</li>)}</ul></>}

      <H n={++n}>What we need from you</H>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">{(p.dependencies.length ? p.dependencies : ["Approval of the content we publish"]).map((x) => <li key={x}>{x}</li>)}</ul>
      <p className="mt-4 text-sm font-medium text-neutral-900">Assumptions</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{p.assumptions.map((x) => <li key={x}>{x}</li>)}</ul>

      <H n={++n}>Next steps</H>
      <ol className="mt-4 list-decimal space-y-1.5 pl-5">{p.next_steps.map((x) => <li key={x}>{x}</li>)}</ol>

      <footer className="mt-12 border-t border-neutral-200 pt-4 text-xs text-neutral-500">{p.prepared_by.company}{p.prepared_by.website ? ` · ${p.prepared_by.website}` : ""} · Prepared for {p.prepared_for.name} on {date(p.date)}</footer>
    </article>
  );
}
