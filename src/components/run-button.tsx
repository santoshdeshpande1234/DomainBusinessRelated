"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Step = { ok?: string; error?: string; remaining?: number };

/**
 * Runs a server step and, when it reports work remaining, calls it again until done or stopped.
 * Each step is short, so progress is saved as it goes and an interrupted run resumes where it left off.
 */
export function RunButton({ run, children, className = "btn-secondary", loop = false, confirm, disabled }: {
  run: () => Promise<Step>; children: React.ReactNode; className?: string; loop?: boolean; confirm?: string; disabled?: boolean;
}) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<Step | null>(null);
  const stopped = useRef(false);
  const router = useRouter();

  const go = () => {
    if (confirm && !window.confirm(confirm)) return;
    stopped.current = false;
    start(async () => {
      for (let i = 0; i < 200; i++) {
        const r = await run();
        setMsg(r);
        router.refresh();
        if (r.error || !loop || !r.remaining || stopped.current) break;
      }
    });
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="inline-flex gap-2">
        <button type="button" className={className} disabled={busy || disabled} onClick={go} aria-busy={busy}>{children}</button>
        {busy && loop && <button type="button" className="btn-ghost" onClick={() => { stopped.current = true; }}>Stop</button>}
      </span>
      {msg && (
        <span role="status" className={`text-xs ${msg.error ? "text-bad" : "text-muted"}`}>
          {busy && "Working… "}{msg.error ?? msg.ok}{msg.remaining ? ` ${msg.remaining} left.` : ""}
        </span>
      )}
    </span>
  );
}
