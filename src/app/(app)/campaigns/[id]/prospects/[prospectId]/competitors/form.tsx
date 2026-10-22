"use client";
import { useActionState } from "react";
import { Submit, useKeepValues } from "@/components/submit";
import { Result } from "@/components/result";
import { addCompetitor } from "./actions";

export function AddCompetitorForm({ campaignId, prospectId }: { campaignId: string; prospectId: string }) {
  const [state, dispatch, pending] = useActionState(addCompetitor.bind(null, campaignId, prospectId), undefined);
  return (
    <form onSubmit={useKeepValues(dispatch)} className="grid gap-3">
      <div><label className="label" htmlFor="name">Business name</label><input id="name" name="name" className="input" required /></div>
      <div><label className="label" htmlFor="website">Website</label><input id="website" name="website" className="input" placeholder="example.com" /></div>
      <div><label className="label" htmlFor="source_url">Where you found it</label><input id="source_url" name="source_url" type="url" className="input" placeholder="https://…" required /></div>
      <div><Submit className="btn-secondary" busy={pending} pending="Adding…">Add competitor</Submit><Result state={state} /></div>
    </form>
  );
}
