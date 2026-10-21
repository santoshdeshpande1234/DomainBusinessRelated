import { Card, Notice, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { userClient } from "@/lib/supabase/server";
import { WorkspaceForm } from "./workspace-form";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const s = await getSession();
  const db = await userClient();
  const { data: ws } = await db.from("workspaces").select("*").eq("id", s.workspace.id).single();
  const readOnly = !can(s.role, "workspace:write");
  return (
    <>
      <PageHeader title="Workspace settings" description="Defaults used across campaigns, proposals and emails." />
      {readOnly && <div className="mb-4"><Notice tone="neutral">Only admins can change workspace settings.</Notice></div>}
      <Card><WorkspaceForm ws={ws!} readOnly={readOnly} /></Card>
    </>
  );
}
