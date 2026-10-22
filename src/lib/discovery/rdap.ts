import "server-only";
import { cached, logUsage } from "./net";

// Registry status via RDAP, the registries' official public lookup. Free and keyless.
// The IANA bootstrap file maps each TLD to its registry's RDAP server.
const BOOTSTRAP = "https://data.iana.org/rdap/dns.json";

export type RegistryResult = {
  status: "registered" | "unregistered" | "unsupported" | "error";
  source: string; checked_at: string;
  registrar?: string; created?: string; expires?: string; error?: string;
};

async function rdapBase(tld: string): Promise<string | null> {
  const { value } = await cached("rdap:bootstrap", 24 * 7, null, "iana", async () => {
    const res = await fetch(BOOTSTRAP, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`IANA bootstrap ${res.status}`);
    const body = (await res.json()) as { services: [string[], string[]][] };
    const map: Record<string, string> = {};
    for (const [tlds, urls] of body.services) for (const t of tlds) map[t] = urls.find((u) => u.startsWith("https://")) ?? urls[0];
    return map;
  });
  return value[tld] ?? null;
}

export function parseRdap(body: Record<string, unknown>) {
  const events = (body.events as { eventAction: string; eventDate: string }[] | undefined) ?? [];
  const date = (a: string) => events.find((e) => e.eventAction === a)?.eventDate;
  const entities = (body.entities as { roles?: string[]; vcardArray?: [string, [string, unknown, string, string][]] }[] | undefined) ?? [];
  const registrar = entities.find((e) => e.roles?.includes("registrar"))?.vcardArray?.[1]?.find((v) => v[0] === "fn")?.[3];
  return { registrar, created: date("registration"), expires: date("expiration") };
}

/** Looks up one domain. Cached for 12 hours; a 404 from the registry means it holds no record of the name. */
export async function checkRegistry(name: string, ctx: { workspaceId: string; campaignId: string; userId: string }): Promise<RegistryResult> {
  const tld = name.slice(name.lastIndexOf(".") + 1);
  const now = () => new Date().toISOString();
  let base: string | null;
  try { base = await rdapBase(tld); } catch (e) { return { status: "error", source: BOOTSTRAP, checked_at: now(), error: (e as Error).message }; }
  if (!base) return { status: "unsupported", source: BOOTSTRAP, checked_at: now(), error: `The .${tld} registry does not publish RDAP` };
  const url = `${base.replace(/\/?$/, "/")}domain/${encodeURIComponent(name)}`;

  const { value } = await cached(`rdap:${name}`, 12, null, "rdap", async (): Promise<RegistryResult> => {
    const started = Date.now();
    try {
      const res = await fetch(url, { cache: "no-store", headers: { accept: "application/rdap+json" }, signal: AbortSignal.timeout(4000) });
      const r: RegistryResult = res.status === 404 ? { status: "unregistered", source: url, checked_at: now() }
        : res.ok ? { status: "registered", source: url, checked_at: now(), ...parseRdap(await res.json()) }
        : { status: "error", source: url, checked_at: now(), error: `Registry answered ${res.status}` };
      await logUsage({ workspace_id: ctx.workspaceId, campaign_id: ctx.campaignId, actor_id: ctx.userId, provider: "rdap", operation: "domain_lookup", status: r.status === "error" ? "error" : "ok", latency_ms: Date.now() - started });
      if (r.status === "error") throw Object.assign(new Error(r.error), { result: r });
      return r;
    } catch (e) {
      const r = (e as { result?: RegistryResult }).result;
      throw Object.assign(new Error((e as Error).message), { result: r ?? { status: "error", source: url, checked_at: now(), error: (e as Error).name === "TimeoutError" ? "Registry timed out" : (e as Error).message } });
    }
  }).catch((e) => ({ value: (e as { result?: RegistryResult }).result ?? { status: "error" as const, source: url, checked_at: now(), error: "Lookup failed" } }));
  return value;
}
