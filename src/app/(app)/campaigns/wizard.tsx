"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { COUNTRIES, CURRENCIES, EXTENSIONS, INDUSTRIES, LANGUAGES, OBJECTIVES, labelOf } from "@/lib/options";
import { campaignSchema, fieldErrors } from "@/lib/validation";
import { money } from "@/lib/format";
import type { SaveResult } from "./actions";

export type WizardValues = {
  name: string; industry: string; custom_industry: string; notes: string;
  country: string; region: string; city: string; service_area: string; language: string; currency: string;
  objectives: string[];
  domain_budget: string; prospect_budget: string; max_prospects: string; min_quality_score: string; extensions: string[];
  limits: { max_domains: string; daily_email_limit: string; max_api_spend_usd: string };
  service_pricing: { website_build: string; website_redesign: string; monthly_retainer: string };
};

const STEPS = [
  { title: "Basics", fields: ["name", "industry", "custom_industry", "notes"] },
  { title: "Market", fields: ["country", "region", "city", "service_area", "language", "currency"] },
  { title: "Objectives", fields: ["objectives"] },
  { title: "Budget & targets", fields: ["domain_budget", "prospect_budget", "max_prospects", "min_quality_score", "extensions", "limits"] },
  { title: "Pricing & review", fields: ["service_pricing"] },
];

function Field({ label, name, error, hint, children }: { label: string; name: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      {children}
      {error ? <p className="error" id={`${name}-error`}>{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function CampaignWizard({ initial, action, cancelHref, editing }: {
  initial: WizardValues; action: (input: unknown) => Promise<SaveResult>; cancelHref: string; editing: boolean;
}) {
  const [v, setV] = useState(initial);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customExt, setCustomExt] = useState("");
  const [pending, start] = useTransition();

  const set = <K extends keyof WizardValues>(k: K, val: WizardValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const err = (k: string) => errors[k];
  const inputProps = (k: keyof WizardValues) => ({
    id: k, name: k, className: "input", value: v[k] as string, "aria-invalid": !!err(k) || undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(k, e.target.value as never),
  });

  const parsed = useMemo(() => campaignSchema.safeParse(v), [v]);
  const allErrors = parsed.success ? {} : fieldErrors(parsed.error);
  const stepErrors = (i: number) => Object.fromEntries(Object.entries(allErrors).filter(([k]) => STEPS[i].fields.includes(k.split(".")[0])));

  function next() {
    const e = stepErrors(step);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => s + 1);
  }
  function goTo(i: number) {
    for (let j = 0; j < i; j++) {
      const e = stepErrors(j);
      if (Object.keys(e).length) { setErrors(e); setStep(j); return; }
    }
    setErrors({});
    setStep(Math.min(i, STEPS.length - 1));
  }
  function submit() {
    if (!parsed.success) { goTo(STEPS.length); return; }
    start(async () => {
      const res = await action(v);
      if (res?.errors) {
        setErrors(res.errors);
        const bad = STEPS.findIndex((s) => Object.keys(res.errors).some((k) => s.fields.includes(k.split(".")[0])));
        if (bad >= 0) setStep(bad);
      }
    });
  }

  const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const cur = v.currency;

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button type="button" onClick={() => goTo(i)}
              className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-sm ${i === step ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2"}`}>
              <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${i < step ? "bg-accent text-accent-ink" : i === step ? "border-2 border-accent" : "border border-line"}`}>
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              {s.title}
            </button>
          </li>
        ))}
      </ol>

      <div className="card">
        <div className="space-y-5 p-5 sm:p-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-faint">Step {step + 1} of {STEPS.length}</p>
            <h2 className="mt-1 text-lg font-semibold">{STEPS[step].title}</h2>
          </div>

          {step === 0 && (
            <div className="space-y-4">
              <Field label="Campaign name" name="name" error={err("name")}><input {...inputProps("name")} placeholder="e.g. Austin dental clinics" maxLength={120} /></Field>
              <Field label="Industry" name="industry" error={err("industry")}>
                <select {...inputProps("industry")}>{INDUSTRIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </Field>
              {v.industry === "custom" && (
                <Field label="Describe the industry" name="custom_industry" error={err("custom_industry")}><input {...inputProps("custom_industry")} placeholder="e.g. Veterinary clinics" maxLength={80} /></Field>
              )}
              <Field label="Notes (optional)" name="notes" error={err("notes")} hint="Internal context for your team. Not shown to prospects.">
                <textarea {...inputProps("notes")} rows={3} maxLength={2000} />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Country" name="country" error={err("country")}>
                <input {...inputProps("country")} list="countries" />
                <datalist id="countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="State or region (optional)" name="region" error={err("region")}><input {...inputProps("region")} /></Field>
              <Field label="City (optional)" name="city" error={err("city")}><input {...inputProps("city")} /></Field>
              <Field label="Service area (optional)" name="service_area" error={err("service_area")} hint="e.g. 25 km around downtown"><input {...inputProps("service_area")} /></Field>
              <Field label="Language" name="language" error={err("language")}>
                <select {...inputProps("language")}>{LANGUAGES.map((l) => <option key={l}>{l}</option>)}</select>
              </Field>
              <Field label="Currency" name="currency" error={err("currency")} hint="Budgets and pricing use this currency. The exchange rate is saved with the campaign.">
                <select {...inputProps("currency")}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
              </Field>
            </div>
          )}

          {step === 2 && (
            <fieldset>
              <legend className="label">What should this campaign achieve?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {OBJECTIVES.map(([k, l, d]) => {
                  const on = v.objectives.includes(k);
                  return (
                    <label key={k} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${on ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2"}`}>
                      <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={on} onChange={() => set("objectives", toggle(v.objectives, k))} />
                      <span><span className="block text-sm font-medium">{l}</span><span className="block text-xs text-muted">{d}</span></span>
                    </label>
                  );
                })}
              </div>
              {err("objectives") && <p className="error">{err("objectives")}</p>}
            </fieldset>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`Domain budget (${cur})`} name="domain_budget" error={err("domain_budget")} hint="Upper limit for domain purchases. Nothing is bought without approval.">
                  <input {...inputProps("domain_budget")} type="number" min={0} step="any" inputMode="decimal" />
                </Field>
                <Field label={`Prospect research budget (${cur})`} name="prospect_budget" error={err("prospect_budget")}>
                  <input {...inputProps("prospect_budget")} type="number" min={0} step="any" inputMode="decimal" />
                </Field>
                <Field label="Maximum prospects" name="max_prospects" error={err("max_prospects")}>
                  <input {...inputProps("max_prospects")} type="number" min={1} max={1000} step={1} />
                </Field>
                <Field label={`Minimum quality score: ${v.min_quality_score || 0}`} name="min_quality_score" error={err("min_quality_score")} hint="Prospects and domains scoring below this are hidden.">
                  <input {...inputProps("min_quality_score")} type="range" min={0} max={100} step={5} className="w-full accent-[var(--accent)]" />
                </Field>
              </div>
              <fieldset>
                <legend className="label">Domain extensions</legend>
                <div className="flex flex-wrap gap-2">
                  {[...new Set([...EXTENSIONS, ...v.extensions])].map((e) => {
                    const on = v.extensions.includes(e);
                    return (
                      <button type="button" key={e} aria-pressed={on} onClick={() => set("extensions", toggle(v.extensions, e))}
                        className={`rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:bg-surface-2"}`}>{e}</button>
                    );
                  })}
                </div>
                <div className="mt-2 flex max-w-xs gap-2">
                  <input className="input" placeholder="Add another, e.g. .shop" value={customExt} aria-label="Custom extension"
                    onChange={(e) => setCustomExt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.currentTarget.nextElementSibling as HTMLButtonElement).click(); } }} />
                  <button type="button" className="btn-secondary" onClick={() => {
                    const e = customExt.trim().toLowerCase().replace(/^(?!\.)/, ".");
                    if (e.length > 2 && !v.extensions.includes(e)) set("extensions", [...v.extensions, e]);
                    setCustomExt("");
                  }}>Add</button>
                </div>
                {err("extensions") && <p className="error">{err("extensions")}</p>}
              </fieldset>
              <fieldset className="rounded-lg border border-line p-4">
                <legend className="px-1 text-sm font-medium">Safety limits (optional)</legend>
                <div className="grid gap-4 sm:grid-cols-3">
                  {([["max_domains", "Max domains to shortlist", ""], ["daily_email_limit", "Daily email limit", ""], ["max_api_spend_usd", "Max API spend (USD)", "any"]] as const).map(([k, l, step]) => (
                    <Field key={k} label={l} name={`limits.${k}`} error={err(`limits.${k}`)}>
                      <input id={`limits.${k}`} className="input" type="number" min={0} step={step || 1} value={v.limits[k]}
                        onChange={(e) => set("limits", { ...v.limits, [k]: e.target.value })} />
                    </Field>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <p className="label">Your service pricing ({cur})</p>
                <p className="hint -mt-1 mb-3">Used later for financial scenarios. Prefilled from workspace settings; leave blank if unknown.</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  {([["website_build", "New website"], ["website_redesign", "Website redesign"], ["monthly_retainer", "Monthly retainer"]] as const).map(([k, l]) => (
                    <Field key={k} label={l} name={`service_pricing.${k}`} error={err(`service_pricing.${k}`)}>
                      <input id={`service_pricing.${k}`} className="input" type="number" min={0} step="any" value={v.service_pricing[k]}
                        onChange={(e) => set("service_pricing", { ...v.service_pricing, [k]: e.target.value })} />
                    </Field>
                  ))}
                </div>
              </div>
              <div className="rounded-lg bg-surface-2 p-4">
                <p className="mb-3 text-sm font-semibold">Review</p>
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {([
                    ["Name", v.name],
                    ["Industry", v.industry === "custom" ? v.custom_industry : labelOf(INDUSTRIES, v.industry)],
                    ["Location", [v.city, v.region, v.country].filter(Boolean).join(", ")],
                    ["Language / currency", `${v.language} · ${cur}`],
                    ["Objectives", v.objectives.map((o) => labelOf(OBJECTIVES, o)).join(", ")],
                    ["Budgets", `Domains ${money(Number(v.domain_budget || 0), cur)} · Research ${money(Number(v.prospect_budget || 0), cur)}`],
                    ["Targets", `Up to ${v.max_prospects} prospects, minimum score ${v.min_quality_score}`],
                    ["Extensions", v.extensions.join(" ")],
                  ] as const).map(([k, val]) => (
                    <div key={k}><dt className="text-xs text-faint">{k}</dt><dd className="break-words">{val || "—"}</dd></div>
                  ))}
                </dl>
              </div>
            </div>
          )}

          {errors._ && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{errors._}</p>}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-4 sm:px-6">
          <Link href={cancelHref} className="btn-ghost">Cancel</Link>
          <div className="flex gap-2">
            {step > 0 && <button type="button" className="btn-secondary" onClick={() => { setErrors({}); setStep(step - 1); }}>Back</button>}
            {step < STEPS.length - 1
              ? <button type="button" className="btn-primary" onClick={next}>Continue</button>
              : <button type="button" className="btn-primary" onClick={submit} disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Create campaign"}</button>}
          </div>
        </footer>
      </div>
    </div>
  );
}
