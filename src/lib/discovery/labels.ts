import type { Tone } from "@/components/ui";

export const REGISTRY_LABEL: Record<string, string> = {
  unchecked: "Not checked", unregistered: "No registry record", registered: "Registered", unsupported: "No public lookup", error: "Check failed",
};
export const REGISTRY_TONE: Record<string, Tone> = { unchecked: "neutral", unregistered: "good", registered: "bad", unsupported: "warn", error: "warn" };
export const DOMAIN_STATUS_TONE: Record<string, Tone> = { candidate: "neutral", shortlisted: "accent", approved: "good", rejected: "bad" };
export const PROSPECT_STATUS_TONE: Record<string, Tone> = { new: "neutral", selected: "good", excluded: "bad" };

export const scoreTone = (s: number | null | undefined): Tone => (s == null ? "neutral" : s >= 70 ? "good" : s >= 45 ? "warn" : "bad");
