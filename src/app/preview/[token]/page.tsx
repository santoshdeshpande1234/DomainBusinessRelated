import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { adminClient, userClient } from "@/lib/supabase/server";
import { SitePreview } from "@/components/site-preview";
import type { SiteContent } from "@/lib/studio/site";

// Only what the page renders; the internal plan and generation log are never loaded here.
const COLUMNS = "id, workspace_id, campaign_id, domain_id, status, share_enabled, theme, layout, content";

// Members of the workspace can open any of its previews (and its saved versions). Anyone else needs a
// link a member has shared, and sees only the current version.
const load = cache(async (token: string, version: number | null) => {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const db = await userClient();
  const { data: { user } } = await db.auth.getUser();
  let row = null, internal = false;
  if (user) {
    const { data } = await db.from("website_previews").select(COLUMNS).eq("token", token).maybeSingle();
    if (data) { row = data; internal = true; }
  }
  const admin = adminClient();
  if (!row) {
    const { data } = await admin.from("website_previews").select(COLUMNS).eq("token", token).eq("share_enabled", true).neq("status", "archived").maybeSingle();
    row = data;
  }
  if (!row) return null;
  let shown = { content: row.content, theme: row.theme, layout: row.layout, version: null as number | null };
  if (internal && version) {
    const { data: v } = await db.from("website_preview_versions").select("version, content, theme, layout").eq("preview_id", row.id).eq("version", version).maybeSingle();
    if (!v) return null;
    shown = v;
  }
  const [{ data: ws }, { data: domain }] = await Promise.all([
    admin.from("workspaces").select("name").eq("id", row.workspace_id).single(),
    row.domain_id ? admin.from("domains").select("name").eq("id", row.domain_id).eq("campaign_id", row.campaign_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { row, shown, internal, owner: ws?.name ?? "Domain2Revenue", domain: domain?.name ?? null };
});

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ view?: string; v?: string }> };
const versionOf = (v?: string) => (v && /^\d{1,6}$/.test(v) ? Number(v) : null);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const r = await load((await params).token, versionOf((await searchParams).v));
  const c = r?.shown.content as SiteContent | undefined;
  return { title: { absolute: c?.meta?.title ?? "Website preview" }, description: c?.meta?.description, robots: { index: false, follow: false } };
}

export default async function PreviewPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const version = versionOf(sp.v);
  const r = await load(token, version);
  if (!r || !r.shown.content?.brand) notFound();
  const q = version ? `&v=${version}` : "";
  const links = { site: `/preview/${token}${version ? `?v=${version}` : ""}`, plan: `/preview/${token}?view=plan${q}` };
  return (
    <>
      {r.internal && !r.row.share_enabled && <div className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-950 print:hidden">Private draft: only your workspace can open this link until sharing is turned on.</div>}
      {r.shown.version && <div className="bg-sky-100 px-4 py-1.5 text-center text-xs text-sky-950 print:hidden">Saved version {r.shown.version}, visible to your workspace only.</div>}
      <SitePreview content={r.shown.content as SiteContent} theme={r.shown.theme} layout={r.shown.layout} domain={r.domain} owner={r.owner} year={new Date().getUTCFullYear()}
        view={sp.view === "plan" ? "plan" : "site"} links={links} />
    </>
  );
}
