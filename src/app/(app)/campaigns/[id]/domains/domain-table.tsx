"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { money } from "@/lib/format";
import { REGISTRY_LABEL, REGISTRY_TONE, DOMAIN_STATUS_TONE } from "@/lib/discovery/labels";
import type { StepResult } from "./actions";

export type DomainRow = {
  id: string; name: string; registry_status: string; price: number | null; price_currency: string | null;
  score: number | null; confidence: number | null; status: string; origin: string;
};

export function DomainTable({ campaignId, rows, write, setStatus }: {
  campaignId: string; rows: DomainRow[]; write: boolean;
  setStatus: (ids: string[], status: string) => Promise<StepResult>;
}) {
  const [q, setQ] = useState("");
  const [status, setStatusFilter] = useState("active");
  const [registry, setRegistry] = useState("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<StepResult | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  const shown = useMemo(() => rows.filter((r) =>
    (!q || r.name.includes(q.trim().toLowerCase())) &&
    (status === "all" || (status === "active" ? r.status !== "rejected" : r.status === status)) &&
    (registry === "all" || r.registry_status === registry)), [rows, q, status, registry]);
  const allOn = shown.length > 0 && shown.every((r) => sel.has(r.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ids = [...sel].filter((id) => shown.some((r) => r.id === id));

  const bulk = (st: string) => start(async () => {
    const r = await setStatus(ids, st);
    setMsg(r);
    if (!r.error) setSel(new Set());
    router.refresh();
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input max-w-56" placeholder="Search domains" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search domains" />
        <select className="input w-auto max-w-full" value={status} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
          <option value="active">All except rejected</option><option value="all">All</option>
          <option value="candidate">Candidates</option><option value="shortlisted">Shortlisted</option>
          <option value="approved">Approved</option><option value="rejected">Rejected</option>
        </select>
        <select className="input w-auto max-w-full" value={registry} onChange={(e) => setRegistry(e.target.value)} aria-label="Registry status">
          <option value="all">Any registry status</option>
          {Object.entries(REGISTRY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="ml-auto text-xs text-faint">{shown.length} of {rows.length}</span>
      </div>

      {write && ids.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span className="font-medium">{ids.length} selected</span>
          <button className="btn-secondary py-1" disabled={busy} onClick={() => bulk("shortlisted")}>Shortlist</button>
          <button className="btn-secondary py-1" disabled={busy} onClick={() => bulk("approved")}>Approve for purchase review</button>
          <button className="btn-secondary py-1" disabled={busy} onClick={() => bulk("candidate")}>Back to candidate</button>
          <button className="btn-danger py-1" disabled={busy} onClick={() => bulk("rejected")}>Reject</button>
          {ids.length >= 2 && ids.length <= 4 && <Link className="btn-ghost py-1" href={`/campaigns/${campaignId}/domains/compare?ids=${ids.join(",")}`}>Compare</Link>}
        </div>
      )}
      {!write && ids.length >= 2 && ids.length <= 4 && (
        <div className="mb-3"><Link className="btn-secondary py-1" href={`/campaigns/${campaignId}/domains/compare?ids=${ids.join(",")}`}>Compare {ids.length}</Link></div>
      )}
      {msg && <p role="status" className={`mb-3 text-xs ${msg.error ? "text-bad" : "text-muted"}`}>{msg.error ?? msg.ok}</p>}

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="w-10 px-3 py-2"><input type="checkbox" aria-label="Select all shown" checked={allOn}
                onChange={() => setSel(allOn ? new Set() : new Set(shown.map((r) => r.id)))} /></th>
              <th className="px-3 py-2 font-medium">Domain</th>
              <th className="px-3 py-2 font-medium">Registry</th>
              <th className="px-3 py-2 text-right font-medium">First-year price</th>
              <th className="px-3 py-2 text-right font-medium">Score</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-surface">
            {shown.map((r) => (
              <tr key={r.id} className={sel.has(r.id) ? "bg-accent-soft/40" : ""}>
                <td className="px-3 py-2"><input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="px-3 py-2"><Link href={`/campaigns/${campaignId}/domains/${r.id}`} className="font-medium hover:text-accent">{r.name}</Link>
                  {r.origin === "manual" && <span className="ml-2 text-xs text-faint">added</span>}</td>
                <td className="px-3 py-2"><Badge tone={REGISTRY_TONE[r.registry_status]}>{REGISTRY_LABEL[r.registry_status]}</Badge></td>
                <td className="px-3 py-2 text-right tabular-nums">{r.price != null ? money(Number(r.price), r.price_currency ?? "USD") : <span className="text-faint">Not verified</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.score ?? "—"}<span className="ml-1 text-xs text-faint">{r.confidence != null ? `${r.confidence}% conf.` : ""}</span></td>
                <td className="px-3 py-2"><Badge tone={DOMAIN_STATUS_TONE[r.status]}>{r.status}</Badge></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">No domains match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
