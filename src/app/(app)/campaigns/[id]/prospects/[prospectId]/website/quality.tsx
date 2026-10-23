import { Badge, Card, type Tone } from "@/components/ui";
import { RunButton } from "@/components/run-button";
import { DIRECTIONS, DIRECTION_KEYS, derivePalette, resolveDirection } from "@/lib/studio/design";
import { qualityGate, type CheckStatus } from "@/lib/studio/quality";
import type { Blueprint } from "@/lib/studio/blueprint";
import type { SiteContent } from "@/lib/studio/site";
import { setDirection } from "./actions";

const STATUS: Record<CheckStatus, [string, Tone]> = { pass: ["Passed", "good"], warn: ["Check", "warn"], fail: ["Failed", "bad"], not_run: ["Not run here", "neutral"] };

/** The quality gate, recomputed from the stored content on every view. */
export function QualityCard({ content, blueprint, others }: { content: SiteContent; blueprint: Blueprint | null; others: string[] }) {
  const q = qualityGate(content, { blueprint, others });
  return (
    <Card title="Quality gate" description="Checked against the stored content each time this page loads. Browser checks run in the automated suite and are not counted as passed.">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-2xl font-semibold">{q.score}</span><span className="text-muted">/100</span>
        <Badge tone={q.ready ? "good" : "bad"}>{q.ready ? "Ready to show" : "Not ready"}</Badge>
      </p>
      <p className="mt-1 text-xs text-muted">{q.summary}</p>
      <ul className="mt-3 divide-y divide-line text-xs">
        {q.checks.map((c) => (
          <li key={c.key} className="flex gap-2 py-1.5">
            <span className="shrink-0"><Badge tone={STATUS[c.status][1]}>{STATUS[c.status][0]}</Badge></span>
            <span><span className="font-medium">{c.label}</span>{c.critical && <span className="text-faint"> · required</span>}<span className="block text-muted">{c.detail}</span></span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Design direction switcher: changes the look only, keeping text, pages and the Growth Plan. */
export function DesignCard({ campaignId, prospectId, theme, content, write }: { campaignId: string; prospectId: string; theme: string; content: SiteContent; write: boolean }) {
  const current = resolveDirection(theme, content.industry);
  const pal = derivePalette({ brand: content.brand.colors?.accent, ink: content.brand.colors?.ink, industry: content.industry, legacyTheme: current.legacy });
  const sw = [pal.tokens.primary, pal.tokens.accent, pal.tokens.dark, pal.tokens.surfaceAlt];
  return (
    <Card title="Design direction" description="Switching keeps every page, fact and Growth Plan feature; a version is saved first.">
      <div className="flex items-center gap-1.5">
        {sw.map((c) => <span key={c} title={c} className="h-5 w-5 rounded border border-line" style={{ background: c }} />)}
        <span className="ml-1 text-xs text-muted">{pal.source === "brand" ? "From their brand colour" : pal.source === "legacy" ? "From the earlier theme" : "Industry palette"}</span>
      </div>
      {pal.notes.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-muted">{pal.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      <ul className="mt-3 space-y-2">
        {DIRECTION_KEYS.map((k) => (
          <li key={k} className="flex items-start justify-between gap-3 text-sm">
            <span><span className="font-medium">{DIRECTIONS[k].label}</span>{k === current.key && <> <Badge tone="accent">current</Badge></>}<span className="block text-xs text-muted">{DIRECTIONS[k].description}</span></span>
            {write && k !== current.key && <RunButton run={setDirection.bind(null, campaignId, prospectId, k)} className="btn-secondary shrink-0 py-1 text-xs">Use</RunButton>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
