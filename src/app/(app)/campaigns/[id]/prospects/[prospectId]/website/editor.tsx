"use client";
import { useActionState } from "react";
import { Submit, useKeepValues } from "@/components/submit";
import { Result } from "@/components/result";
import { LAYOUTS, type SiteContent } from "@/lib/studio/site";
import { DIRECTIONS, DIRECTION_KEYS, isDirection, resolveDirection } from "@/lib/studio/design";
import { saveContent } from "./actions";

function F({ name, label, value, hint, rows, max }: { name: string; label: string; value: string; hint?: string; rows?: number; max?: number }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      {rows ? <textarea id={name} name={name} rows={rows} defaultValue={value} maxLength={max} className="input" /> : <input id={name} name={name} defaultValue={value} maxLength={max} className="input" />}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Editor({ campaignId, prospectId, content: c, theme, layout, domainId, domains }: {
  campaignId: string; prospectId: string; content: SiteContent; theme: string; layout: string; domainId: string | null; domains: { id: string; name: string; status: string }[];
}) {
  const [state, dispatch, pending] = useActionState(saveContent.bind(null, campaignId, prospectId), undefined);
  return (
    <form onSubmit={useKeepValues(dispatch)} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="label" htmlFor="theme">Design direction</label>
          <select id="theme" name="theme" defaultValue={isDirection(theme) ? theme : resolveDirection(theme).key} className="input">
            {DIRECTION_KEYS.map((k) => <option key={k} value={k}>{DIRECTIONS[k].label}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="layout">Hero (Corporate only)</label><select id="layout" name="layout" defaultValue={layout} className="input">{Object.entries(LAYOUTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><label className="label" htmlFor="domain_id">Proposed domain</label>
          <select id="domain_id" name="domain_id" defaultValue={domainId ?? ""} className="input">
            <option value="">None yet</option>
            {domains.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.status})</option>)}
          </select>
        </div>
      </div>
      <F name="eyebrow" label="Line above the headline" value={c.brand.eyebrow} max={200} />
      <F name="headline" label="Headline" value={c.hero.headline} max={120} />
      <F name="sub" label="Supporting line" value={c.hero.sub} rows={2} max={300} />
      <div className="grid gap-4 sm:grid-cols-2">
        <F name="primary_cta" label="Main button" value={c.hero.primary_cta} max={40} />
        <F name="secondary_cta" label="Second button" value={c.hero.secondary_cta} max={40} />
      </div>
      <F name="services" label="Services" rows={5} value={c.services.map((s) => (s.text ? `${s.title} | ${s.text}` : s.title)).join("\n")} hint="One per line, optionally 'Name | one line about it'. Only services the business actually offers." />
      <F name="features" label="What the site lets visitors do" rows={4} value={c.features.join("\n")} hint="One per line. Describe the site, not results." />
      <F name="steps" label="How it works" rows={3} value={c.steps.join("\n")} />
      <F name="about" label="About" rows={4} value={c.about} max={2000} hint="Their own description where possible. No awards, reviews, client names or results unless the business has published them." />
      <div className="grid gap-4 sm:grid-cols-2">
        <F name="meta_title" label="Search title" value={c.meta.title} max={70} hint="Up to 70 characters." />
        <F name="meta_description" label="Search description" value={c.meta.description} max={160} hint="Up to 160 characters." />
      </div>
      <div><Submit busy={pending} pending="Saving…">Save</Submit><Result state={state} /></div>
    </form>
  );
}
