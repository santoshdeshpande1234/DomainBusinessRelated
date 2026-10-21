"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePerm } from "@/lib/session";
import { adminClient, userClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { fieldErrors, inviteSchema } from "@/lib/validation";
import { ROLES } from "@/lib/options";
import type { FormState } from "../actions";

const done = () => revalidatePath("/settings/team");
const friendly = (msg: string) => (msg.includes("at least one active admin") ? "A workspace needs at least one active admin." : msg);

export async function inviteMember(_: FormState, form: FormData): Promise<FormState> {
  let s;
  try { s = await requirePerm("team:manage"); } catch (e) { return { errors: { _: (e as Error).message } }; }
  const parsed = inviteSchema.safeParse({ email: form.get("email"), role: form.get("role") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const { email, role } = parsed.data;
  const db = await userClient();
  const { data: member } = await db.from("memberships").select("user_id").eq("email", email).maybeSingle();
  if (member) return { errors: { email: "This person is already in the workspace." } };
  const { error } = await db.from("invites").insert({ workspace_id: s.workspace.id, email, role, invited_by: s.userId });
  if (error) return { errors: { email: error.code === "23505" ? "This email already has a pending invite (here or in another workspace)." : error.message } };
  done();
  // Supabase emails the invite link. An existing account just signs in as usual and the invite is applied.
  const { error: mail } = await adminClient().auth.admin.inviteUserByEmail(email, { redirectTo: `${serverEnv("APP_URL")}/auth/callback?next=${encodeURIComponent("/account?welcome=1")}` });
  if (mail) {
    if (/already been registered|already registered|exists/i.test(mail.message)) return { ok: `${email} already has an account. They can sign in now to join.` };
    return { ok: `Invite saved, but the email could not be sent (${mail.message}). ${email} can still sign in with an email link.` };
  }
  return { ok: `Invite sent to ${email}.` };
}

export async function revokeInvite(id: string) {
  await requirePerm("team:manage");
  const db = await userClient();
  const { error } = await db.from("invites").update({ status: "revoked" }).eq("id", id).eq("status", "pending");
  if (error) throw new Error(error.message);
  done();
}

export async function updateMember(userId: string, _: FormState, form: FormData): Promise<FormState> {
  try { await requirePerm("team:manage"); } catch (e) { return { errors: { _: (e as Error).message } }; }
  const parsed = z.object({ role: z.enum(ROLES), status: z.enum(["active", "disabled"]) }).safeParse({ role: form.get("role"), status: form.get("status") });
  if (!parsed.success) return { errors: { _: "Invalid role or status." } };
  const db = await userClient();
  const { error } = await db.from("memberships").update(parsed.data).eq("user_id", userId);
  if (error) return { errors: { _: friendly(error.message) } };
  done();
  return { ok: "Saved." };
}

export async function removeMember(userId: string, _: FormState): Promise<FormState> {
  try { await requirePerm("team:manage"); } catch (e) { return { errors: { _: (e as Error).message } }; }
  const db = await userClient();
  const { error } = await db.from("memberships").delete().eq("user_id", userId);
  if (error) return { errors: { _: friendly(error.message) } };
  done();
  return { ok: "Removed." };
}
