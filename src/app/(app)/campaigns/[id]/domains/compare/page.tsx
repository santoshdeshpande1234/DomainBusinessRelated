import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { userClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import { valuation, type Component } from "@/lib/discovery/domains";
import { DOMAIN_STATUS_TONE, REGISTRY_LABEL, REGISTRY_TONE } from "@/lib/discovery/labels";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D = Record<string, any>;

export const metadata = { title: "Compare domains" };

export default async function ComparePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ids?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ids = (sp.ids ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 4);
  const db = await userClient();
  const [{ data: c }, { data: ds = [] }, { data: comps = [] }] = await Promise.all([
    db.from("campaigns").select("name, currency").eq("id", id).maybeSingle(),
    db.from("domains").select("*").eq("campaign_id", id).in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    db.from("evidence").select("domain_id, detail").eq("campaign_id", id).eq("kind", "comparable_sale").in("domain_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  if (!c) notFound();
  const m = (n: number | null) => (n == null ? "—" : money(Number(n), c.currency, { maximumFractionDigits: 0 }));
  const keys = ((ds![0]?.score_detail?.components ?? []) as Component[]).map((x) => [x.key, x.label] as const);

  const rows: [string, (d: D) => React.ReactNode][] = [
    ["Score", (d) => <span className="font-semibold tabular-nums">{d.score ?? "—"}<span className="ml-1 text-xs font-normal text-faint">{d.confidence}% conf.</span></span>],
    ["Registry", (d) => <Badge tone={REGISTRY_TONE[d.registry_status]}>{REGISTRY_LABEL[d.registry_status]}</Badge>],
    ["Status", (d) => <Badge tone={DOMAIN_STATUS_TONE[d.status]}>{d.status}</Badge>],
    ["First-year price", (d) => (d.price != null ? m(d.price) : "Not verified")],
    ["Renewal", (d) => (d.renewal_price != null ? m(d.renewal_price) : "Not verified")],
    ["Valuation (median)", (d) => { const v = valuation(comps!.filter((x) => x.domain_id === d.id).map((x) => Number(x.detail.price))); return v ? m(v.mid) : "Insufficient evidence"; }],
    ...keys.map(([k, label]) => [label, (d: D) => {
      const x = ((d.score_detail?.components ?? []) as Component[]).find((y) => y.key === k);
      return x?.score == null ? <span className="text-xs text-faint">no data</span> : x.score;
    }] as [string, (d: D) => React.ReactNode]),
  ];

  return (
    <>
      <nav className="mb-3 text-sm text-muted"><Link href={`/campaigns/${id}`} className="hover:text-ink">{c.name}</Link> / <Link href={`/campaigns/${id}/domains`} className="hover:text-ink">Domains</Link> / </nav>
      <PageHeader title="Compare domains" />
      <Card>
        {ds!.length < 2 ? <p className="text-sm text-muted">Select two to four domains in the table to compare them.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr><th className="w-44" />{ds!.map((d) => <th key={d.id} className="px-3 py-2 text-left"><Link href={`/campaigns/${id}/domains/${d.id}`} className="hover:text-accent">{d.name}</Link></th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map(([label, f]) => <tr key={label}><th className="py-2 pr-3 text-left text-xs font-medium text-muted">{label}</th>{ds!.map((d) => <td key={d.id} className="px-3 py-2">{f(d)}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
