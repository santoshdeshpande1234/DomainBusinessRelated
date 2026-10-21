"use client";
import { useActionState } from "react";
import { Submit, useKeepValues } from "@/components/submit";
import { CURRENCIES, LANGUAGES } from "@/lib/options";
import { updateWorkspace } from "./actions";

type WS = {
  name: string; default_currency: string; default_language: string; company_name: string; company_website: string;
  sender_name: string; monthly_api_budget_usd: number | null; service_pricing: Record<string, number | undefined>;
};

export function WorkspaceForm({ ws, readOnly }: { ws: WS; readOnly: boolean }) {
  const [state, action, pending] = useActionState(updateWorkspace, undefined);
  const onSubmit = useKeepValues(action);
  const e = state?.errors ?? {};
  const field = (name: string, label: string, def: string | number | null | undefined, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input className="input" id={name} name={name} defaultValue={def ?? ""} disabled={readOnly} aria-invalid={!!e[name] || undefined} {...props} />
      {e[name] ? <p className="error">{e[name]}</p> : hint && <p className="hint">{hint}</p>}
    </div>
  );
  const sp = ws.service_pricing ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-sm font-semibold sm:col-span-2">Workspace</h2>
        {field("name", "Workspace name", ws.name, { required: true, maxLength: 80 })}
        <div>
          <label className="label" htmlFor="default_currency">Default currency</label>
          <select className="input" id="default_currency" name="default_currency" defaultValue={ws.default_currency} disabled={readOnly}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <div>
          <label className="label" htmlFor="default_language">Default language</label>
          <select className="input" id="default_language" name="default_language" defaultValue={ws.default_language} disabled={readOnly}>{LANGUAGES.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        {field("monthly_api_budget_usd", "Monthly API budget (USD)", ws.monthly_api_budget_usd, { type: "number", min: 0, step: "any" }, "Shown against usage. Paid lookups stop when a campaign's limit is reached.")}
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-sm font-semibold sm:col-span-2">Your company <span className="font-normal text-muted">(appears on proposals and emails)</span></h2>
        {field("company_name", "Company name", ws.company_name, { maxLength: 120 })}
        {field("company_website", "Company website", ws.company_website, { type: "url", placeholder: "https://", maxLength: 200 })}
        {field("sender_name", "Sender name", ws.sender_name, { maxLength: 80 })}
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        <h2 className="text-sm font-semibold sm:col-span-3">Default service pricing <span className="font-normal text-muted">(in the default currency; new campaigns start with these)</span></h2>
        {field("website_build", "New website", sp.website_build, { type: "number", min: 0, step: "any" })}
        {field("website_redesign", "Website redesign", sp.website_redesign, { type: "number", min: 0, step: "any" })}
        {field("monthly_retainer", "Monthly retainer", sp.monthly_retainer, { type: "number", min: 0, step: "any" })}
      </section>
      {(e._ || state?.ok) && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${e._ ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}>{e._ ?? state?.ok}</p>}
      {!readOnly && <Submit pending="Saving…" busy={pending}>Save settings</Submit>}
    </form>
  );
}
