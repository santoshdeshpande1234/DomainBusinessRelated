import { ExternalLink } from "lucide-react";
import { when } from "@/lib/format";

export type EvidenceRow = {
  id: number; kind: string; label: string; value: string | null; detail: Record<string, unknown>;
  source_name: string; source_url: string | null; assumption: boolean; observed_at: string;
};

export function ScoreBreakdown({ components, flags }: { components: { key: string; label: string; weight: number; score: number | null; note: string }[]; flags: string[] }) {
  return (
    <div className="space-y-3">
      <ul className="space-y-2.5">
        {components.map((c) => (
          <li key={c.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{c.label} <span className="text-xs text-faint">weight {c.weight}</span></span>
              <span className="tabular-nums">{c.score == null ? <span className="text-xs text-faint">no data</span> : c.score}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              {c.score != null && <div className="h-full rounded-full bg-accent" style={{ width: `${c.score}%` }} />}
            </div>
            <p className="mt-0.5 text-xs text-muted">{c.note}</p>
          </li>
        ))}
      </ul>
      {flags.length > 0 && <ul className="space-y-1 border-t border-line pt-3 text-xs text-warn">{flags.map((f) => <li key={f}>⚠ {f}</li>)}</ul>}
    </div>
  );
}

export function EvidenceList({ rows, empty }: { rows: EvidenceRow[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="-my-2 divide-y divide-line">
      {rows.map((e) => (
        <li key={e.id} className="py-2.5 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">{e.label}{e.assumption && <span className="ml-2 text-xs font-normal text-warn">assumption</span>}</span>
            <span className="text-xs text-faint">{when(e.observed_at)}</span>
          </div>
          {e.value && <p className="mt-0.5 break-words text-muted">{e.value}</p>}
          <p className="mt-0.5 text-xs text-faint">
            Source: {e.source_url
              ? <a href={e.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 hover:text-accent">{e.source_name}<ExternalLink className="size-3" aria-hidden /></a>
              : e.source_name}
          </p>
        </li>
      ))}
    </ul>
  );
}
