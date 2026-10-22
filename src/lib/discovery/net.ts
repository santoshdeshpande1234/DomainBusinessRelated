import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { adminClient } from "@/lib/supabase/server";

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateIp(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") ||
    v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
}

/**
 * Fetches a public web page for auditing. Prospect websites are untrusted input, so this only allows
 * http(s) on default ports, refuses hosts that resolve to private addresses (checked on every redirect),
 * caps the body size and time, and returns text that callers treat strictly as data.
 */
export async function fetchPublicPage(url: string, { timeoutMs = 6000, maxBytes = 1_500_000 } = {}) {
  let current = new URL(url);
  const started = Date.now();
  for (let hop = 0; hop < 5; hop++) {
    if (!["http:", "https:"].includes(current.protocol) || current.port || current.username) throw new Error("Only public http(s) URLs can be checked");
    const addrs = await lookup(current.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("Address is not public");
    const res = await fetch(current, {
      redirect: "manual", cache: "no-store",
      signal: AbortSignal.timeout(Math.max(500, timeoutMs - (Date.now() - started))),
      headers: { "user-agent": "Domain2RevenueBot/1.0 (website audit)", accept: "text/html,application/xhtml+xml" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current);
      continue;
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); break; }
      chunks.push(value);
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks));
    return { finalUrl: current.toString(), status: res.status, html, bytes: size, ms: Date.now() - started, headers: res.headers, truncated: size > maxBytes };
  }
  throw new Error("Too many redirects");
}

/** Server-side response cache for external lookups. */
export async function cached<T>(key: string, ttlHours: number, workspaceId: string | null, provider: string, load: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  const db = adminClient();
  const { data } = await db.from("research_cache").select("payload, expires_at").eq("key", key).maybeSingle();
  if (data && new Date(data.expires_at) > new Date()) return { value: data.payload as T, hit: true };
  const value = await load();
  await db.from("research_cache").upsert({
    key, workspace_id: workspaceId, provider, payload: value as object,
    fetched_at: new Date().toISOString(), expires_at: new Date(Date.now() + ttlHours * 3600_000).toISOString(),
  });
  return { value, hit: false };
}

export async function logUsage(row: { workspace_id: string; campaign_id?: string; provider: string; operation: string; units?: number; est_cost_usd?: number; status?: string; latency_ms?: number; actor_id?: string }) {
  await adminClient().from("api_usage").insert({ units: 1, est_cost_usd: 0, ...row });
}

/** Estimated spend recorded against a campaign, in USD. */
export async function campaignSpendUsd(campaignId: string) {
  const { data } = await adminClient().from("api_usage").select("est_cost_usd").eq("campaign_id", campaignId);
  return (data ?? []).reduce((s, r) => s + Number(r.est_cost_usd ?? 0), 0);
}
