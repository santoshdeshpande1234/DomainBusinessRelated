import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import type { Campaign } from "@/lib/types";
import { CampaignWizard } from "../../wizard";
import { toWizard } from "../../values";
import { saveCampaign } from "../../actions";

export const metadata = { title: "Edit campaign" };

export default async function EditCampaign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!can(s.role, "campaign:write")) redirect(`/campaigns/${id}`);
  const db = await userClient();
  const { data: c } = await db.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const { data: ws } = await db.from("workspaces").select("default_currency, default_language, service_pricing").eq("id", s.workspace.id).single();
  return (
    <>
      <PageHeader title={`Edit ${c.name}`} description="Changing the currency saves a fresh exchange rate with the campaign." />
      <CampaignWizard initial={toWizard(c as Campaign, ws!)} action={saveCampaign.bind(null, id)} cancelHref={`/campaigns/${id}`} editing />
    </>
  );
}
