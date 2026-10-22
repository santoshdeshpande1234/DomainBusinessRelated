import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { adminClient, userClient } from "@/lib/supabase/server";
import { SitePreview } from "@/components/site-preview";
import type { SiteContent } from "@/lib/studio/site";

// Members of the workspace can open any of its previews. Anyone else needs a link a member has shared.
const load = cache(async (token: string) => {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const db = await userClient();
  const { data: { user } } = await db.auth.getUser();
  let row = null, internal = false;
  if (user) {
    const { data } = await db.from("website_previews").select("*").eq("token", token).maybeSingle();
    if (data) { row = data; internal = true; }
  }
  const admin = adminClient();
  if (!row) {
    const { data } = await admin.from("website_previews").select("*").eq("token", token).eq("share_enabled", true).neq("status", "archived").maybeSingle();
    row = data;
  }
  if (!row) return null;
  const [{ data: ws }, { data: domain }] = await Promise.all([
    admin.from("workspaces").select("name").eq("id", row.workspace_id).single(),
    row.domain_id ? admin.from("domains").select("name").eq("id", row.domain_id).eq("campaign_id", row.campaign_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { row, internal, owner: ws?.name ?? "Domain2Revenue", domain: domain?.name ?? null };
});

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const r = await load((await params).token);
  const c = r?.row.content as SiteContent | undefined;
  return { title: { absolute: c?.meta?.title ?? "Website preview" }, description: c?.meta?.description, robots: { index: false, follow: false } };
}

export default async function PreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const r = await load((await params).token);
  if (!r || !r.row.content?.brand) notFound();
  return (
    <>
      {r.internal && !r.row.share_enabled && <div className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-950">Private draft: only your workspace can open this link until sharing is turned on.</div>}
      <SitePreview content={r.row.content as SiteContent} theme={r.row.theme} layout={r.row.layout} domain={r.domain} owner={r.owner} year={new Date().getUTCFullYear()} />
    </>
  );
}
