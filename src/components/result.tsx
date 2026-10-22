import type { StepResult } from "@/app/(app)/campaigns/[id]/domains/actions";

export function Result({ state }: { state: StepResult | undefined }) {
  if (!state) return null;
  return <p role="status" className={`mt-2 text-xs ${state.error ? "text-bad" : "text-good"}`}>{state.error ?? state.ok}</p>;
}
