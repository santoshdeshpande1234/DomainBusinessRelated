"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type Tone } from "@/components/ui";
import { IDLE, StageList, runPipeline, type RunState } from "../prospects/[prospectId]/website/pipeline";

export type StudioRow = {
  id: string; name: string; website: string | null; category: string | null; audited: "checked" | "failed" | "not checked" | "no website";
  preview: { status: string; shared: boolean; generation: string | null } | null;
};

const WEB_TONE: Record<string, Tone> = { draft: "neutral", ready: "good", archived: "neutral" };
const RUN_TONE: Record<RunState["state"], Tone> = { idle: "neutral", running: "accent", complete: "good", partial: "warn", failed: "bad", skipped: "neutral" };
const RUN_LABEL: Record<RunState["state"], string> = { idle: "", running: "Working", complete: "Preview ready", partial: "Partial result", failed: "Failed", skipped: "Kept existing" };

/**
 * Selected prospects with independent generation. Runs one prospect at a time (gentle on rate limits);
 * each row keeps its own stages and errors, and a failed row can be retried alone.
 */
export function StudioBatch({ campaignId, rows, write }: { campaignId: string; rows: StudioRow[]; write: boolean }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [replace, setReplace] = useState(false);
  const [refresh, setRefresh] = useState(false);
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const set = (id: string) => (r: RunState) => setRuns((x) => ({ ...x, [id]: r }));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const go = (ids: string[], force = false) => start(async () => {
    for (const id of ids) {
      const row = rows.find((r) => r.id === id)!;
      if (row.preview && !replace && !force) { set(id)({ state: "skipped", stages: [], running: null, message: "Already has a preview; kept as it is." }); continue; }
      setOpen(id);
      await runPipeline(campaignId, id, { mode: "site", refresh }, set(id));
    }
    router.refresh();
  });
  const all = picked.size === rows.length;

  return (
    <div>
      {write && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line px-5 py-4">
          <button type="button" className="btn-primary" disabled={busy || !picked.size} onClick={() => go(rows.filter((r) => picked.has(r.id)).map((r) => r.id))}>
            {busy ? "Generating…" : `Generate preview${picked.size === 1 ? "" : "s"} for ${picked.size} selected`}
          </button>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} disabled={busy} />Replace existing previews (a version is kept)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={refresh} onChange={(e) => setRefresh(e.target.checked)} disabled={busy} />Re-check websites first</label>
          <p className="w-full text-xs text-muted">Each prospect gets its own preview built only from its own facts. Previews are generated one at a time; checks older than 30 days are refreshed automatically. No AI calls are made.</p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-faint">
            {write && <th className="w-10 px-5 py-3"><input type="checkbox" aria-label="Select all" checked={all && rows.length > 0} onChange={() => setPicked(all ? new Set() : new Set(rows.map((r) => r.id)))} /></th>}
            <th className="px-3 py-3 font-medium">Prospect</th><th className="px-3 py-3 font-medium">Website</th><th className="px-3 py-3 font-medium">Website check</th>
            <th className="px-3 py-3 font-medium">Preview</th><th className="px-5 py-3 font-medium">This run</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const run = runs[r.id] ?? IDLE;
              const base = `/campaigns/${campaignId}/prospects/${r.id}`;
              return (
                <tr key={r.id} className={open === r.id && run.state !== "idle" ? "bg-surface-2/50" : ""}>
                  {write && <td className="px-5 py-3 align-top"><input type="checkbox" aria-label={`Select ${r.name}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} disabled={busy} /></td>}
                  <td className="px-3 py-3 align-top"><Link href={`${base}/website`} className="font-medium hover:text-accent">{r.name}</Link>{r.category && <span className="block text-xs text-faint">{r.category}</span>}</td>
                  <td className="px-3 py-3 align-top text-xs">{r.website ? <a href={r.website} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">{r.website.replace(/^https?:\/\//, "")}</a> : <span className="text-faint">None listed</span>}</td>
                  <td className="px-3 py-3 align-top"><Badge tone={r.audited === "checked" ? "good" : r.audited === "failed" ? "bad" : "neutral"}>{r.audited}</Badge></td>
                  <td className="px-3 py-3 align-top">{r.preview ? <span className="flex flex-wrap gap-1.5"><Badge tone={WEB_TONE[r.preview.status]}>{r.preview.status}</Badge>{r.preview.shared && <Badge tone="accent">shared</Badge>}{r.preview.generation === "partial" && <Badge tone="warn">partial</Badge>}{r.preview.generation === "failed" && <Badge tone="bad">last run failed</Badge>}</span> : <span className="text-faint">Not started</span>}</td>
                  <td className="px-5 py-3 align-top">
                    {run.state === "idle" ? <span className="text-xs text-faint">—</span> : (
                      <div className="space-y-1.5">
                        <button type="button" className="flex items-center gap-2" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}><Badge tone={RUN_TONE[run.state]}>{RUN_LABEL[run.state]}</Badge><span className="text-xs text-muted">{open === r.id ? "Hide steps" : "Show steps"}</span></button>
                        {open === r.id && <StageList run={run} compact />}
                        {run.message && <p className={`text-xs ${run.state === "failed" ? "text-bad" : "text-muted"}`}>{run.message}</p>}
                        {run.state === "failed" && write && <button type="button" className="btn-secondary py-1 text-xs" disabled={busy} onClick={() => go([r.id], true)}>Retry</button>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
