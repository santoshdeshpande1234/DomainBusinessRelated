"use client";
import { useActionState, useState } from "react";
import { Submit, useKeepValues } from "@/components/submit";
import { Result } from "@/components/result";
import { FIELDS, SCENARIOS, type Input, type ModelKind } from "@/lib/studio/financial";
import { saveModel } from "./actions";

const BASIS = [["actual", "From the business"], ["benchmark", "Published benchmark"], ["assumption", "Assumption"]] as const;

function shown(unit: string, v: number | null | undefined) {
  if (v == null) return "";
  return unit === "pct" ? String(Math.round(v * 10000) / 100) : String(v);
}

function Row({ k, label, help, unit, currency, value }: { k: string; label: string; help?: string; unit: string; currency: string; value?: Input }) {
  const suffix = unit === "pct" ? "%" : unit === "money" ? currency : unit === "months" ? "months" : unit === "minutes" ? "min" : "";
  return (
    <div className="grid gap-2 border-b border-line py-3 last:border-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.1fr)] sm:items-start">
      <div className="min-w-0"><label htmlFor={k} className="text-sm font-medium">{label}</label>{help && <p className="text-xs text-muted">{help}</p>}</div>
      <div className="flex items-center gap-1.5"><input id={k} name={k} inputMode="decimal" defaultValue={shown(unit, value?.value)} className="input tabular-nums" />{suffix && <span className="shrink-0 text-xs text-faint">{suffix}</span>}</div>
      <select name={`${k}__basis`} aria-label={`${label}: where it comes from`} defaultValue={value?.basis ?? "actual"} className="input">
        {BASIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <input name={`${k}__src`} aria-label={`${label}: source link or note`} defaultValue={value?.source_url ?? value?.note ?? ""} placeholder="Source link or note" className="input" />
    </div>
  );
}

export function ModelForm({ campaignId, prospectId, currency, model, inputs }: { campaignId: string; prospectId: string; currency: string; model: ModelKind; inputs: Record<string, Input> }) {
  const [state, dispatch, pending] = useActionState(saveModel.bind(null, campaignId, prospectId), undefined);
  // Selects keep their first value, so the fields remount when stored sources change outside this form (e.g. starter assumptions).
  const sources = Object.entries(inputs).map(([k, v]) => `${k}:${v.basis}`).sort().join(",");
  return (
    <form onSubmit={useKeepValues(dispatch)}>
      <Fields key={sources} currency={currency} model={model} inputs={inputs} />
      <div className="mt-4"><Submit busy={pending} pending="Calculating…">Save and calculate</Submit><Result state={state} /></div>
    </form>
  );
}

function Fields({ currency, model, inputs }: { currency: string; model: ModelKind; inputs: Record<string, Input> }) {
  const [kind, setKind] = useState<ModelKind>(model);
  return (
    <>
      <fieldset className="mb-4 flex flex-wrap gap-4 text-sm">
        <legend className="sr-only">Business model</legend>
        {([["lead_gen", "Inquiries and bookings"], ["ecommerce", "Online store"]] as const).map(([v, l]) => (
          <label key={v} className="flex items-center gap-2"><input type="radio" name="model" value={v} checked={kind === v} onChange={() => setKind(v)} />{l}</label>
        ))}
      </fieldset>
      <p className="mb-2 text-xs text-muted">Choose where each figure comes from. A published benchmark needs its link. Blank optional fields are left out of the result.</p>
      <div>
        {FIELDS.filter((f) => f.kinds.includes(kind)).map((f) => (
          <Row key={f.key} k={f.key} label={`${f.label}${f.required ? "" : " (optional)"}`} help={f.help} unit={f.unit} currency={currency} value={inputs[f.key]} />
        ))}
      </div>
      <h3 className="mt-6 text-sm font-semibold">Scenarios</h3>
      <p className="mb-2 text-xs text-muted">Relative change versus today, e.g. 25 means 25% more. Tie each to a recommended improvement, not a target.</p>
      {SCENARIOS.map((s) => (
        <div key={s.key}>
          <Row k={`${s.key}_traffic`} label={`${s.label}: traffic change`} unit="pct" currency={currency} value={inputs[`${s.key}_traffic`]} />
          <Row k={`${s.key}_conversion`} label={`${s.label}: conversion change`} unit="pct" currency={currency} value={inputs[`${s.key}_conversion`]} />
        </div>
      ))}
    </>
  );
}
