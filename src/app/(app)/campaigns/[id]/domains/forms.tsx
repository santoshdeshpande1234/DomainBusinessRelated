"use client";
import { useActionState } from "react";
import { Submit, useKeepValues } from "@/components/submit";
import { addComparable, addDomains, recordPrice, type StepResult } from "./actions";

function Result({ state }: { state: StepResult | undefined }) {
  if (!state) return null;
  return <p role="status" className={`mt-2 text-xs ${state.error ? "text-bad" : "text-good"}`}>{state.error ?? state.ok}</p>;
}

export function AddDomainsForm({ campaignId }: { campaignId: string }) {
  const [state, dispatch, pending] = useActionState(addDomains.bind(null, campaignId), undefined);
  return (
    <form onSubmit={useKeepValues(dispatch)}>
      <label className="label" htmlFor="names">Domain names</label>
      <textarea id="names" name="names" rows={4} className="input font-mono" placeholder={"smilecare.in\nbestdentalpune.com"} required />
      <Submit className="btn-secondary mt-3" busy={pending} pending="Adding…">Add domains</Submit>
      <Result state={state} />
    </form>
  );
}

export function PriceForm({ campaignId, domainId, currency }: { campaignId: string; domainId: string; currency: string }) {
  const [state, dispatch, pending] = useActionState(recordPrice.bind(null, campaignId, domainId), undefined);
  return (
    <form onSubmit={useKeepValues(dispatch)} className="grid gap-3 sm:grid-cols-2">
      <div><label className="label" htmlFor="price">First-year price ({currency})</label><input id="price" name="price" type="number" min="0" step="0.01" className="input" required /></div>
      <div><label className="label" htmlFor="renewal_price">Renewal price ({currency})</label><input id="renewal_price" name="renewal_price" type="number" min="0" step="0.01" className="input" required /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="source_url">Where you checked it</label><input id="source_url" name="source_url" type="url" className="input" placeholder="https://registrar.example/search?q=…" required /></div>
      <div className="sm:col-span-2"><Submit className="btn-secondary" busy={pending} pending="Saving…">Record price</Submit><Result state={state} /></div>
    </form>
  );
}

export function ComparableForm({ campaignId, domainId, currency }: { campaignId: string; domainId: string; currency: string }) {
  const [state, dispatch, pending] = useActionState(addComparable.bind(null, campaignId, domainId), undefined);
  return (
    <form onSubmit={useKeepValues(dispatch)} className="grid gap-3 sm:grid-cols-2">
      <div><label className="label" htmlFor="sold_name">Domain sold</label><input id="sold_name" name="sold_name" className="input" placeholder="dentalclinic.in" required /></div>
      <div><label className="label" htmlFor="cprice">Sale price ({currency})</label><input id="cprice" name="price" type="number" min="0" step="1" className="input" required /></div>
      <div><label className="label" htmlFor="sold_on">Sale date</label><input id="sold_on" name="sold_on" type="date" className="input" required /></div>
      <div><label className="label" htmlFor="venue">Venue (optional)</label><input id="venue" name="venue" className="input" placeholder="NameBio, Sedo…" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="csource">Source link</label><input id="csource" name="source_url" type="url" className="input" required /></div>
      <div className="sm:col-span-2"><Submit className="btn-secondary" busy={pending} pending="Saving…">Add comparable</Submit><Result state={state} /></div>
    </form>
  );
}
