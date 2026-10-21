import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { userClient } from "@/lib/supabase/server";
import { can, type Perm } from "@/lib/permissions";
import type { Role } from "@/lib/options";

export type Session = {
  userId: string; email: string; name: string | null; role: Role;
  workspace: { id: string; name: string; default_currency: string; default_language: string };
};

/** The signed-in user's membership, or a redirect to sign-in / no-access. Cached per request. */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await userClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const load = () => supabase.from("memberships")
    .select("role, full_name, status, workspace:workspaces(id, name, default_currency, default_language)")
    .eq("user_id", auth.user!.id).maybeSingle();
  let { data: m } = await load();
  if (!m) {
    // First sign-in after an invite: turn the pending invite into a membership.
    const { data: ws } = await supabase.rpc("accept_invite");
    if (ws) ({ data: m } = await load());
  }
  if (!m || m.status !== "active" || !m.workspace) redirect("/auth/no-access");
  const ws = m.workspace as unknown as Session["workspace"];
  return { userId: auth.user.id, email: auth.user.email ?? "", name: m.full_name, role: m.role as Role, workspace: ws };
});

/** For server actions: the session, or an error result when the role lacks the permission. */
export async function requirePerm(perm: Perm) {
  const s = await getSession();
  if (!can(s.role, perm)) throw new Error("Your role does not allow this action.");
  return s;
}
