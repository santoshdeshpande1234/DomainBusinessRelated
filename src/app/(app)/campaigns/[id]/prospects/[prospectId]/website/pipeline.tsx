"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { STAGES, type Stage, type StageKey } from "@/lib/studio/compose";
import { buildPreview, researchPreview } from "./actions";

export type RunState = { state: "idle" | "running" | "complete" | "partial" | "failed" | "skipped"; stages: Stage[]; running: StageKey | null; message?: string };
export const IDLE: RunState = { state: "idle", stages: [], running: null };

/**
 * Runs one prospect's generation as two server steps (research, then build) and reports each stage
 * as the server finished it. Nothing is shown as done before the server says so.
 */
export async function runPipeline(campaignId: string, prospectId: string, opts: { mode: "site" | "plan"; refresh: boolean }, update: (r: RunState) => void): Promise<RunState> {
  update({ state: "running", stages: [], running: "context" });
  const a = await researchPreview(campaignId, prospectId, opts.refresh);
  if (a.error) { const r: RunState = { state: "failed", stages: a.stages ?? [], running: null, message: a.error }; update(r); return r; }
  update({ state: "running", stages: a.stages ?? [], running: "gaps" });
  const b = await buildPreview(campaignId, prospectId, opts.mode, a.stages);
  const stages = b.stages ?? [];
  const r: RunState = { state: b.error ? "failed" : stages.some((s) => s.status === "partial") ? "partial" : "complete", stages, running: null, message: b.error ?? b.ok };
  update(r);
  return r;
}

const MARK: Record<Stage["status"], [string, string]> = { done: ["✓", "text-good"], partial: ["!", "text-warn"], skipped: ["–", "text-faint"], failed: ["✗", "text-bad"] };

export function StageList({ run, compact = false }: { run: RunState; compact?: boolean }) {
  if (run.state === "idle") return null;
  const runningAt = run.running ? STAGES.findIndex((s) => s.key === run.running) : -1;
  return (
    <ol className={`grid gap-1 text-xs ${compact ? "" : "sm:grid-cols-2"}`} aria-live="polite">
      {STAGES.map((s, i) => {
        const got = run.stages.find((x) => x.key === s.key);
        const busy = !got && runningAt >= 0 && i >= runningAt && run.state === "running";
        const [m, tone] = got ? MARK[got.status] : busy && i === runningAt ? ["…", "text-accent"] : ["○", "text-faint"];
        return (
          <li key={s.key} className="flex gap-2">
            <span className={`w-3 shrink-0 font-semibold ${tone}`} aria-hidden>{m}</span>
            <span><span className={got ? "font-medium" : "text-muted"}>{s.label}</span>{busy && i === runningAt && <span className="text-muted"> (working)</span>}{got?.note && !compact && <span className="block text-muted">{got.note}</span>}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Generate (or regenerate) this prospect's preview with research, showing each stage. */
export function PipelineButton({ campaignId, prospectId, mode, refresh = false, label, className = "btn-primary", confirm }: {
  campaignId: string; prospectId: string; mode: "site" | "plan"; refresh?: boolean; label: string; className?: string; confirm?: string;
}) {
  const [run, setRun] = useState<RunState>(IDLE);
  const [busy, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" className={className} disabled={busy} aria-busy={busy}
        onClick={() => { if (confirm && !window.confirm(confirm)) return; start(async () => { await runPipeline(campaignId, prospectId, { mode, refresh }, setRun); router.refresh(); }); }}>{label}</button>
      {run.state !== "idle" && (
        <div className="w-full max-w-md rounded-lg border border-line bg-surface p-3">
          <StageList run={run} compact />
          {run.message && <p role="status" className={`mt-2 text-xs ${run.state === "failed" ? "text-bad" : "text-muted"}`}>{run.message}</p>}
        </div>
      )}
    </div>
  );
}
