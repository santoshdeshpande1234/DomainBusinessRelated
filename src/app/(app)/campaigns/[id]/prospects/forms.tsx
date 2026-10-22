"use client";
import { useActionState } from "react";
import { Submit, useKeepValues } from "@/components/submit";
import { importCsv, updateProspect } from "./actions";
import type { StepResult } from "../domains/actions";

function Result({ state }: { state: StepResult | undefined }) {
  if (!state) return null;
  return <p role="status" className={`mt-2 text-xs ${state.error ? "text-bad" : "text-good"}`}>{state.error ?? state.ok}</p>;
}

export function ImportForm({ campaignId }: { campaignId: string }) {
  const [state, action, pending] = useActionState(importCsv.bind(null, campaignId), undefined);
  return (
    <form action={action}>
      <label className="label" htmlFor="file">CSV file</label>
      <input id="file" name="file" type="file" accept=".csv,text/csv" className="input" required />
      <p className="hint">Needs a <code>name</code> column. Also read: website, phone, email, address, city, region, country, category, contact_name, contact_role, notes. Only import data you&apos;re allowed to use.</p>
      <Submit className="btn-secondary mt-3" busy={pending} pending="Importing…">Import</Submit>
      <Result state={state} />
    </form>
  );
}

export function ContactForm({ campaignId, prospectId, initial }: { campaignId: string; prospectId: string; initial: Record<string, string | null> }) {
  const [state, dispatch, pending] = useActionState(updateProspect.bind(null, campaignId, prospectId), undefined);
  const onSubmit = useKeepValues(dispatch);
  const f = (name: string, label: string, type = "text") => (
    <div><label className="label" htmlFor={name}>{label}</label><input id={name} name={name} type={type} defaultValue={initial[name] ?? ""} className="input" /></div>
  );
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      {f("contact_name", "Decision-maker name")}
      {f("contact_role", "Role")}
      {f("email", "Business email", "email")}
      {f("phone", "Phone")}
      {f("source_url", "Where you found these details", "url")}
      <div><label className="label" htmlFor="notes">Notes</label><textarea id="notes" name="notes" rows={3} defaultValue={initial.notes ?? ""} className="input" /></div>
      <p className="hint">Only record details published by the business or from a licensed source. A public address doesn&apos;t by itself mean they agreed to marketing email.</p>
      <div><Submit className="btn-secondary" busy={pending} pending="Saving…">Save</Submit><Result state={state} /></div>
    </form>
  );
}
