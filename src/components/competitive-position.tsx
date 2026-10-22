// Internal view of a business's competitive position: where it is ahead, behind or on open ground,
// the capabilities to build and the five-year outlook. Used in the website studio and on the competitor page.
import { Badge, Card, type Tone } from "@/components/ui";
import type { Advantage, Position } from "@/lib/studio/advantage";

export const POSITION: Record<Position, [string, Tone]> = {
  ahead: ["Ahead", "good"], level: ["Level", "neutral"], behind: ["Behind", "bad"], open: ["Open ground", "accent"], unknown: ["Not compared", "warn"],
};
const LIKELY: Record<string, Tone> = { high: "good", medium: "accent", low: "neutral" };
const READY: Record<string, Tone> = { ready: "good", partly: "neutral", "not yet": "bad", unknown: "warn" };
const STRENGTH: Record<string, Tone> = { strong: "good", moderate: "accent", weak: "warn" };

export function CompetitivePosition({ a, title = "Competitive position" }: { a: Advantage; title?: string }) {
  return (
    <Card title={title} actions={<Badge tone={STRENGTH[a.evidence.strength]}>Evidence {a.evidence.strength} · {a.evidence.score}/100</Badge>}
      description={`The primary criterion of the audit: where they win or lose customers against nearby businesses. Website defects are one input (digital foundation). ${a.evidence.note}`}>
      <div className="space-y-6">
        <p className="text-sm font-medium">{a.headline}</p>
        {a.evidence.improve.length > 0 && <p className="text-xs text-muted"><span className="font-medium text-warn">To strengthen the evidence:</span> {a.evidence.improve.join("; ")}.</p>}

        <ul className="divide-y divide-line">
          {a.dimensions.map((d) => (
            <li key={d.key} className="py-2">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <Badge tone={POSITION[d.position][1]}>{POSITION[d.position][0]}</Badge>
                  <span className="font-medium">{d.name}</span>
                  <span className="text-xs text-faint">weight {"●".repeat(d.weight)}{"○".repeat(3 - d.weight)} · confidence {["", "low", "medium", "high"][d.confidence]}</span>
                </summary>
                <p className="mt-1 text-xs text-muted">{d.question}</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {d.signals.map((s) => (
                    <li key={s.key} className="flex gap-2"><Badge tone={POSITION[s.position][1]}>{POSITION[s.position][0]}</Badge><span>{s.evidence} <span className="text-faint">({s.source})</span></span></li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>

        <div>
          <h3 className="text-sm font-semibold">Capabilities to build</h3>
          {a.capabilities.length ? (
            <ol className="mt-2 space-y-3">
              {a.capabilities.map((c, i) => (
                <li key={c.key} className="text-sm">
                  <p className="font-medium">{i + 1}. {c.name}</p>
                  <p className="text-xs text-muted">{c.reason}</p>
                  <ul className="mt-1.5 space-y-1.5 border-l border-line pl-3 text-xs">
                    {c.implementations.map((im) => (
                      <li key={im.key + im.text}>
                        <span className="font-medium">{im.text}</span> <Badge tone={LIKELY[im.likelihood]}>{im.likelihood} likelihood</Badge>
                        <span className="block text-muted">{im.why} Measure: {im.kpi}.</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          ) : <p className="mt-1 text-sm text-muted">No dimension where they are behind or where open ground was found.</p>}
        </div>

        <div>
          <h3 className="text-sm font-semibold">Next five years</h3>
          <p className="text-xs text-muted">Industry outlook, not a forecast for this business. Readiness reflects the current position.</p>
          <ul className="mt-2 space-y-2 text-xs">
            {a.outlook.map((o) => (
              <li key={o.trend}>
                <span className="font-medium">{o.trend}</span> <span className="text-faint">({o.horizon})</span> <Badge tone={READY[o.readiness]}>{o.readiness === "unknown" ? "readiness unknown" : o.readiness}</Badge>
                <span className="block text-muted">{o.implication} Prepare: {o.prepare}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
