"use client";
import { useState } from "react";
import { RunButton } from "@/components/run-button";
import { REFINEMENTS, type Refinement } from "@/lib/studio/compose";
import { SECTION_LABELS, type Sections } from "@/lib/studio/site";
import { focusPreview, refinePreview, restoreVersion, setSection } from "./actions";

/** Refinements for this prospect's preview only. Each is a deterministic rule; a version is kept first. */
export function RefinePanel({ campaignId, prospectId, engines, focus, sections, segment }: {
  campaignId: string; prospectId: string; engines: { key: string; name: string }[]; focus: string | null; sections: Sections; segment: string | null;
}) {
  const [seg, setSeg] = useState(segment ?? "");
  const [engine, setEngine] = useState(focus ?? engines[0]?.key ?? "");
  const quick = (Object.keys(REFINEMENTS) as Refinement[]).filter((k) => k !== "segment");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {quick.map((k) => <RunButton key={k} run={refinePreview.bind(null, campaignId, prospectId, k, undefined)} className="btn-secondary py-1 text-xs">{REFINEMENTS[k]}</RunButton>)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="segment">Rewrite for a customer segment</label>
          <div className="flex gap-2">
            <input id="segment" value={seg} onChange={(e) => setSeg(e.target.value)} maxLength={60} placeholder="e.g. busy parents" className="input" />
            <RunButton run={() => refinePreview(campaignId, prospectId, "segment", seg)} className="btn-secondary">Apply</RunButton>
          </div>
          <p className="hint">Adds the segment to the hero and growth plan. Leave blank and apply to remove it.</p>
        </div>
        <div>
          <label className="label" htmlFor="engine">Lead Growth Engine</label>
          <div className="flex gap-2">
            <select id="engine" value={engine} onChange={(e) => setEngine(e.target.value)} className="input">{engines.map((e) => <option key={e.key} value={e.key}>{e.name}</option>)}</select>
            <RunButton run={() => focusPreview(campaignId, prospectId, engine)} className="btn-secondary">Prioritise</RunButton>
          </div>
          <p className="hint">Only engines backed by a gap for this business are listed.</p>
        </div>
      </div>
      <div>
        <p className="label">Sections</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SECTION_LABELS) as (keyof Sections)[]).map((k) => (
            <RunButton key={k} run={setSection.bind(null, campaignId, prospectId, k, !sections[k])} className={sections[k] ? "btn-secondary py-1 text-xs" : "btn-ghost py-1 text-xs"}>{sections[k] ? "✓ " : "+ "}{SECTION_LABELS[k]}</RunButton>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted">Free-text AI rewriting isn&apos;t configured: it would need an OpenAI key in Settings → Integrations. These refinements change design, emphasis and sections without adding facts.</p>
    </div>
  );
}

export function RestoreButton({ campaignId, prospectId, version }: { campaignId: string; prospectId: string; version: number }) {
  return <RunButton run={restoreVersion.bind(null, campaignId, prospectId, version)} className="btn-ghost py-0.5 text-xs" confirm={`Restore version ${version}? The current content is kept as a new version first.`}>Restore</RunButton>;
}
