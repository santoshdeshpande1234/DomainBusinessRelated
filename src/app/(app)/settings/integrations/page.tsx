import { ExternalLink } from "lucide-react";
import { Badge, Notice, PageHeader } from "@/components/ui";
import { Submit } from "@/components/submit";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { PROVIDERS } from "@/lib/options";
import { when } from "@/lib/format";
import { ProviderForm } from "./provider-form";
import { removeIntegration } from "./actions";

export const metadata = { title: "Integrations" };

const STATUS = { saved_unverified: ["Saved, not yet checked", "warn"], verified: ["Verified", "good"], failed: ["Check failed", "bad"] } as const;

export default async function Integrations() {
  const s = await getSession();
  const admin = can(s.role, "integration:write");
  const db = await userClient();
  const { data: rows = [] } = await db.from("integrations").select("provider, hint, status, updated_at");
  const byKey = new Map(rows!.map((r) => [r.provider, r]));
  const categories = [...new Set(PROVIDERS.map((p) => p.category))];

  return (
    <>
      <PageHeader title="Integrations" description="API keys for the data sources each phase uses. Keys are encrypted at rest and never shown again in full." />
      <div className="mb-6"><Notice tone="neutral">No paid calls are made from this page. Each provider is used only when its phase is enabled, and calls are cached and counted in API usage.</Notice></div>
      {!admin && <div className="mb-6"><Notice tone="neutral">Only admins can add or change keys.</Notice></div>}
      <div className="space-y-8">
        {categories.map((cat) => (
          <section key={cat}>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-faint">{cat}</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {PROVIDERS.filter((p) => p.category === cat).map((p) => {
                const row = byKey.get(p.key);
                const st = row ? STATUS[row.status as keyof typeof STATUS] : null;
                return (
                  <article key={p.key} className="card p-5">
                    <header className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium">{p.name} <span className="ml-1 text-xs font-normal text-faint">Phase {p.phase}</span></h3>
                        <p className="mt-0.5 text-sm text-muted">{p.description}</p>
                      </div>
                      {st ? <Badge tone={st[1]}>{st[0]}</Badge> : <Badge>Not connected</Badge>}
                    </header>
                    {admin ? <ProviderForm provider={p} hint={(row?.hint as Record<string, string>) ?? null} />
                      : row && <p className="font-mono text-xs text-muted">{Object.entries(row.hint as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join("  ·  ")}</p>}
                    <footer className="mt-3 flex items-center justify-between gap-3 text-xs text-faint">
                      <a href={p.docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink">Get a key <ExternalLink className="size-3" /></a>
                      {row && <span>Updated {when(row.updated_at)}</span>}
                      {row && admin && <form action={removeIntegration.bind(null, p.key)}><Submit className="text-bad hover:underline" pending="Removing…" confirm={`Remove the ${p.name} key?`}>Remove</Submit></form>}
                    </footer>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
