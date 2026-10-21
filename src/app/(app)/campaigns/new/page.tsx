import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { CampaignWizard } from "../wizard";
import { toWizard } from "../values";
import { saveCampaign } from "../actions";

export const metadata = { title: "New campaign" };

export default async function NewCampaign() {
  const s = await getSession();
  if (!can(s.role, "campaign:write")) redirect("/campaigns");
  const db = await userClient();
  const { data: ws } = await db.from("workspaces").select("default_currency, default_language, service_pricing").eq("id", s.workspace.id).single();
  return (
    <>
      <PageHeader title="New campaign" description="Define the market and goals. Discovery and research run in later phases using these settings." />
      <CampaignWizard initial={toWizard(null, ws!)} action={saveCampaign.bind(null, null)} cancelHref="/campaigns" editing={false} />
    </>
  );
}
