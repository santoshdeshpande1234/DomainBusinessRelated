"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { PROSPECT_STATUS_TONE, scoreTone } from "@/lib/discovery/labels";
import type { StepResult } from "../domains/actions";

export type ProspectRow = {
  id: string; name: string; city: string | null; website: string | null; phone: string | null; email: string | null;
  contact_name: string | null; origin: string; audited_at: string | null; score: number | null; confidence: number | null; status: string; opportunities: number;
};

export function ProspectTable({ campaignId, rows, write, minScore, setStatus }: {
  campaignId: string; rows: ProspectRow[]; write: boolean; minScore: number;
  setStatus: (ids: string[], status: string) => Promise<StepResult>;
}) {
  const [q, setQ] = useState("");
  const [status, setFilter] = useState("active");
  const [min, setMin] = useState(0);
  const [site, setSite] = useState("any");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<StepResult | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!needle || `${r.name} ${r.city ?? ""} ${r.website ?? ""} ${r.contact_name ?? ""}`.toLowerCase().includes(needle)) &&
      (status === "all" || (status === "active" ? r.status !== "excluded" : r.status === status)) &&
      (r.score ?? 0) >= min &&
      (site === "any" || (site === "yes" ? !!r.website : !r.website)));
  }, [rows, q, status, min, site]);
  const allOn = shown.length > 0 && shown.every((r) => sel.has(r.id));
  const ids = [...sel].filter((id) => shown.some((r) => r.id === id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bulk = (st: string) => start(async () => {
    const r = await setStatus(ids, st);
    setMsg(r);
    if (!r.error) setSel(new Set());
    router.refresh();
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input max-w-56" placeholder="Search name, city, site" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search prospects" />
        <select className="input w-auto max-w-full" value={status} onChange={(e) => setFilter(e.target.value)} aria-label="Status">
          <option value="active">All except excluded</option><option value="all">All</option>
          <option value="new">New</option><option value="selected">Selected</option><option value="excluded">Excluded</option>
        </select>
        <select className="input w-auto max-w-full" value={site} onChange={(e) => setSite(e.target.value)} aria-label="Website">
          <option value="any">With or without website</option><option value="yes">Has a website</option><option value="no">No website</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-muted">Min score
          <input type="number" min={0} max={100} className="input w-20" value={min} onChange={(e) => setMin(Number(e.target.value) || 0)} />
        </label>
        {min !== minScore && <button type="button" className="btn-ghost py-1 text-xs" onClick={() => setMin(minScore)}>Use campaign minimum ({minScore})</button>}
        <span className="ml-auto text-xs text-faint">{shown.length} of {rows.length}</span>
      </div>

      {write && ids.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span className="font-medium">{ids.length} selected</span>
          <button className="btn-secondary py-1" disabled={busy} onClick={() => bulk("selected")}>Select for proposals</button>
          <button className="btn-secondary py-1" disabled={busy} onClick={() => bulk("new")}>Reset</button>
          <button className="btn-danger py-1" disabled={busy} onClick={() => bulk("excluded")}>Exclude</button>
        </div>
      )}
      {msg && <p role="status" className={`mb-3 text-xs ${msg.error ? "text-bad" : "text-muted"}`}>{msg.error ?? msg.ok}</p>}

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="w-10 px-3 py-2"><input type="checkbox" aria-label="Select all shown" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(shown.map((r) => r.id)))} /></th>
              <th className="px-3 py-2 font-medium">Business</th>
              <th className="px-3 py-2 font-medium">Website</th>
              <th className="px-3 py-2 font-medium">Contact</th>
              <th className="px-3 py-2 text-right font-medium">Opportunities</th>
              <th className="px-3 py-2 text-right font-medium">Score</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-surface">
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2"><input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="px-3 py-2"><Link href={`/campaigns/${campaignId}/prospects/${r.id}`} className="font-medium hover:text-accent">{r.name}</Link>
                  <span className="block text-xs text-faint">{r.city ?? "City unknown"} · {r.origin === "google_places" ? "Google Maps" : r.origin === "csv" ? "CSV" : "Manual"}</span></td>
                <td className="max-w-48 truncate px-3 py-2 text-xs">{r.website ? r.website.replace(/^https?:\/\/(www\.)?/, "") : <span className="text-faint">None listed</span>}
                  {r.website && !r.audited_at && <span className="block text-faint">not checked</span>}</td>
                <td className="px-3 py-2 text-xs">{r.contact_name ?? (r.email || r.phone ? <span className="text-muted">{r.email ?? r.phone}</span> : <span className="text-faint">Not available</span>)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.audited_at || !r.website ? r.opportunities : "—"}</td>
                <td className="px-3 py-2 text-right"><Badge tone={scoreTone(r.score)}>{r.score ?? "—"}</Badge></td>
                <td className="px-3 py-2"><Badge tone={PROSPECT_STATUS_TONE[r.status]}>{r.status}</Badge></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-muted">No prospects match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
