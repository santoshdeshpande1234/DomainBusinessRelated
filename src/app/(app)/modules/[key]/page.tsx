import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { Badge, Card, Empty, PageHeader, STATUS_TONE } from "@/components/ui";
import { userClient } from "@/lib/supabase/server";
import { LIVE_PHASE, MODULES } from "@/lib/options";
import { title } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const m = MODULES.find((x) => x.key === key);
  return { title: m?.label ?? "Module" };
}

export default async function ModulePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const m = MODULES.find((x) => x.key === key);
  if (!m) notFound();

  if (m.phase <= LIVE_PHASE) {
    // Live modules work per campaign: pick one.
    const db = await userClient();
    const TABLE: Record<string, [string, string]> = {
      domains: ["domains", "domains"], prospects: ["prospects", "prospects"], competitors: ["competitors", "competitors"],
      financials: ["financial_models", "models"], studio: ["website_previews", "previews"],
    };
    const [table, noun] = TABLE[key];
    const [{ data: campaigns = [] }, { data: items = [] }] = await Promise.all([
      db.from("campaigns").select("id, name, status").neq("status", "archived").order("updated_at", { ascending: false }).limit(200),
      db.from(table).select("campaign_id").limit(10000),
    ]);
    const count = (id: string) => items!.filter((i) => i.campaign_id === id).length;
    return (
      <>
        <PageHeader title={m.label} description={m.text} />
        <Card title="Choose a campaign">
          {campaigns!.length === 0 ? <Empty title="No campaigns yet" action={<Link href="/campaigns/new" className="btn-primary">New campaign</Link>}>Discovery works from a campaign&apos;s industry, market and budgets.</Empty> : (
            <ul className="-my-3 divide-y divide-line">
              {campaigns!.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <Link href={`/campaigns/${c.id}/${key}`} className="min-w-0 truncate text-sm font-medium hover:text-accent">{c.name}</Link>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-faint">{count(c.id)} {noun}<Badge tone={STATUS_TONE[c.status]}>{title(c.status)}</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-surface-2"><Lock className="size-5 text-faint" /></div>
      <h1 className="mt-4 text-xl font-semibold">{m.label}</h1>
      <p className="mt-2 text-sm text-muted">{m.text}</p>
      <p className="mt-4 text-xs text-faint">Arrives in Phase {m.phase}. It will use the campaigns, domains and prospects you set up now.</p>
      <div className="mt-6 flex justify-center gap-2"><Link href="/campaigns" className="btn-secondary">View campaigns</Link><Link href="/settings/integrations" className="btn-ghost">Integrations</Link></div>
    </div>
  );
}
