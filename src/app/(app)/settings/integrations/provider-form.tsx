"use client";
import { useActionState } from "react";
import { Submit } from "@/components/submit";
import type { Provider } from "@/lib/options";
import { saveIntegration } from "./actions";

export function ProviderForm({ provider, hint }: { provider: Provider; hint: Record<string, string> | null }) {
  const [state, action] = useActionState(saveIntegration.bind(null, provider.key), undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {provider.fields.map((f) => (
          <div key={f.name}>
            <label className="label" htmlFor={`${provider.key}-${f.name}`}>{f.label}</label>
            <input id={`${provider.key}-${f.name}`} name={f.name} className="input font-mono" autoComplete="off" spellCheck={false}
              type={f.secret ? "password" : "text"} defaultValue={f.secret ? "" : hint?.[f.name] ?? ""}
              placeholder={f.secret && hint?.[f.name] ? `Saved ${hint[f.name]}. Leave blank to keep.` : ""} />
            {e[f.name] && <p className="error">{e[f.name]}</p>}
          </div>
        ))}
      </div>
      {(e._ || state?.ok) && <p role="status" className={`text-xs ${e._ ? "text-bad" : "text-good"}`}>{e._ ?? state?.ok}</p>}
      <Submit className="btn-secondary" pending="Saving…">{hint ? "Update" : "Save"}</Submit>
    </form>
  );
}
