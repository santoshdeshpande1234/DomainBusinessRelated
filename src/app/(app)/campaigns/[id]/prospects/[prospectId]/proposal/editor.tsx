"use client";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Submit, useKeepValues } from "@/components/submit";
import { Result } from "@/components/result";
import { RunButton } from "@/components/run-button";
import { EMAIL_LIMITS, type EmailDraft, type Proposal } from "@/lib/proposals/proposal";
import type { StepResult } from "../../../domains/actions";
import { restoreProposal, saveEmail, saveProposal } from "./actions";

/** Edits the parts a member is expected to tailor: the summary, prices and next steps. */
export function ProposalEditor({ campaignId, prospectId, p }: { campaignId: string; prospectId: string; p: Proposal }) {
  const [state, dispatch, pending] = useActionState(saveProposal.bind(null, campaignId, prospectId), undefined);
  const amt = (k: string) => { const a = p.investment.lines.find((l) => l.key === k)?.amount; return a == null ? "" : String(a); };
  const label = (k: string) => p.investment.lines.find((l) => l.key === k)?.label ?? k;
  return (
    <form onSubmit={useKeepValues(dispatch)} className="grid gap-4">
      <div>
        <label className="label" htmlFor="summary">Summary</label>
        <textarea id="summary" name="summary" rows={5} defaultValue={p.summary} maxLength={1500} className="input" />
        <p className="hint">The opening paragraph. Keep it to facts from the research.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="website_amount">{label("website")} ({p.currency}, one-time)</label><input id="website_amount" name="website_amount" inputMode="decimal" defaultValue={amt("website")} placeholder="To be confirmed" className="input" /></div>
        <div><label className="label" htmlFor="retainer_amount">{label("retainer")} ({p.currency}, per month)</label><input id="retainer_amount" name="retainer_amount" inputMode="decimal" defaultValue={amt("retainer")} placeholder="To be confirmed" className="input" /></div>
      </div>
      <p className="hint -mt-2">Prices start from the campaign&apos;s service pricing (or the workspace defaults). Leave one blank to show &ldquo;To be confirmed&rdquo;; the proposal can&apos;t be marked ready until both are set.</p>
      <div>
        <label className="label" htmlFor="next_steps">Next steps (one per line)</label>
        <textarea id="next_steps" name="next_steps" rows={4} defaultValue={p.next_steps.join("\n")} className="input" />
      </div>
      <div><Submit pending="Saving…" busy={pending}>Save changes</Submit><Result state={state} /></div>
    </form>
  );
}

/** One email draft: edit, copy, or open in the member's own email app. Nothing is sent from Domain2Revenue. */
function Email({ campaignId, prospectId, e, to, write }: { campaignId: string; prospectId: string; e: EmailDraft; to: string | null; write: boolean }) {
  const [subject, setSubject] = useState(e.subject);
  const [body, setBody] = useState(e.body);
  const [msg, setMsg] = useState<StepResult | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const dirty = subject !== e.subject || body !== e.body;
  const copy = async () => {
    try { await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`); setMsg({ ok: "Copied. Paste it into your email app." }); }
    catch { setMsg({ error: "Your browser blocked copying; select the text and copy it by hand." }); }
  };
  const mailto = `mailto:${to ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return (
    <section className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{e.label}</h3>
        <span className="text-xs text-faint">{e.send_after_days ? `Suggested ${e.send_after_days} days after the first email` : "Send first"}</span>
      </div>
      <label className="label mt-3" htmlFor={`${e.key}-s`}>Subject</label>
      <input id={`${e.key}-s`} value={subject} onChange={(x) => setSubject(x.target.value)} maxLength={EMAIL_LIMITS.subject} readOnly={!write} className="input" />
      <label className="label mt-3" htmlFor={`${e.key}-b`}>Message</label>
      <textarea id={`${e.key}-b`} value={body} onChange={(x) => setBody(x.target.value)} rows={12} maxLength={EMAIL_LIMITS.body} readOnly={!write} className="input font-mono text-xs leading-relaxed" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {write && <button type="button" disabled={!dirty || busy} onClick={() => start(async () => { setMsg(await saveEmail(campaignId, prospectId, e.key, subject, body)); router.refresh(); })} className="btn-secondary py-1 text-xs">{busy ? "Saving…" : "Save draft"}</button>}
        <button type="button" onClick={copy} className="btn-ghost py-1 text-xs">Copy</button>
        <a href={mailto} className="btn-ghost py-1 text-xs">Open in your email app</a>
      </div>
      {msg && <p role="status" className={`mt-2 text-xs ${msg.error ? "text-bad" : "text-good"}`}>{msg.error ?? msg.ok}</p>}
    </section>
  );
}

export function EmailDrafts({ campaignId, prospectId, emails, to, write }: { campaignId: string; prospectId: string; emails: EmailDraft[]; to: string | null; write: boolean }) {
  return <div className="space-y-4">{emails.map((e) => <Email key={`${e.key}-${e.subject}-${e.body.length}`} campaignId={campaignId} prospectId={prospectId} e={e} to={to} write={write} />)}</div>;
}

export function RestoreButton({ campaignId, prospectId, version }: { campaignId: string; prospectId: string; version: number }) {
  return <RunButton run={restoreProposal.bind(null, campaignId, prospectId, version)} className="btn-ghost py-0.5 text-xs" confirm={`Restore version ${version}? The current proposal is kept as a new version first.`}>Restore</RunButton>;
}
