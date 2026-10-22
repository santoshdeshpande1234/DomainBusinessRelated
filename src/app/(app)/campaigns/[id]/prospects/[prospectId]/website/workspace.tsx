"use client";
import { useState } from "react";
import { ExternalLink, Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react";

const DEVICES = { desktop: { label: "Desktop", width: "100%", icon: Monitor }, tablet: { label: "Tablet", width: "820px", icon: Tablet }, mobile: { label: "Mobile", width: "390px", icon: Smartphone } } as const;
type Device = keyof typeof DEVICES;

/** The isolated preview frame with device sizes, the two preview pages, and side-by-side version compare. */
export function PreviewWorkspace({ token, name, currentSite, hasPlan, versions }: {
  token: string; name: string; currentSite: string | null; hasPlan: boolean; versions: { version: number; reason: string; at: string }[];
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [view, setView] = useState<"site" | "plan">("site");
  const [compare, setCompare] = useState<number | "">("");
  const [nonce, setNonce] = useState(0);
  const src = (v?: number) => `/preview/${token}?${new URLSearchParams({ ...(view === "plan" ? { view } : {}), ...(v ? { v: String(v) } : {}), r: String(nonce) })}`;
  const frame = (v?: number) => (
    <div className="overflow-hidden rounded-lg border border-line bg-white" style={{ width: compare ? "100%" : DEVICES[device].width, maxWidth: "100%", marginInline: "auto" }}>
      <iframe key={`${src(v)}-${device}`} src={src(v)} title={`${v ? `Version ${v} of the` : "Current"} ${view === "plan" ? "growth plan" : "website preview"} for ${name}`} className="h-[680px] w-full" />
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Preview page" className="inline-flex rounded-lg border border-line p-0.5 text-xs">
          <button type="button" aria-pressed={view === "site"} onClick={() => setView("site")} className={`rounded-md px-2.5 py-1 ${view === "site" ? "bg-accent text-accent-ink" : ""}`}>Proposed website</button>
          <button type="button" aria-pressed={view === "plan"} onClick={() => setView("plan")} disabled={!hasPlan} title={hasPlan ? undefined : "Generate the growth plan first"} className={`rounded-md px-2.5 py-1 disabled:opacity-50 ${view === "plan" ? "bg-accent text-accent-ink" : ""}`}>Growth plan</button>
        </div>
        <div role="group" aria-label="Device" className="inline-flex rounded-lg border border-line p-0.5">
          {(Object.keys(DEVICES) as Device[]).map((d) => { const I = DEVICES[d].icon; return (
            <button key={d} type="button" aria-pressed={device === d} aria-label={DEVICES[d].label} title={DEVICES[d].label} onClick={() => setDevice(d)} disabled={!!compare} className={`rounded-md px-2 py-1 disabled:opacity-50 ${device === d ? "bg-accent text-accent-ink" : ""}`}><I className="size-4" aria-hidden /></button>
          ); })}
        </div>
        <button type="button" onClick={() => setNonce((n) => n + 1)} className="btn-ghost py-1 text-xs"><RefreshCw className="size-3.5" aria-hidden />Refresh</button>
        {versions.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs">Compare with
            <select value={compare} onChange={(e) => setCompare(e.target.value ? Number(e.target.value) : "")} className="input w-auto py-1 text-xs">
              <option value="">No comparison</option>
              {versions.map((v) => <option key={v.version} value={v.version}>v{v.version}: {v.reason}</option>)}
            </select>
          </label>
        )}
        <span className="ml-auto flex flex-wrap gap-2">
          {currentSite && <a href={currentSite} target="_blank" rel="noopener noreferrer nofollow" className="btn-ghost py-1 text-xs"><ExternalLink className="size-3.5" aria-hidden />Their current site</a>}
          <a href={src()} target="_blank" rel="noopener" className="btn-secondary py-1 text-xs"><ExternalLink className="size-3.5" aria-hidden />{view === "plan" ? "Present" : "Open full page"}</a>
        </span>
      </div>
      {compare ? (
        <div className="grid gap-3 xl:grid-cols-2">
          <div><p className="mb-1 text-xs font-medium text-muted">Version {compare}</p>{frame(compare)}</div>
          <div><p className="mb-1 text-xs font-medium text-muted">Current</p>{frame()}</div>
        </div>
      ) : frame()}
      <p className="text-xs text-muted">The proposed redesign is shown above; their current site opens separately and is never copied or framed.</p>
    </div>
  );
}
