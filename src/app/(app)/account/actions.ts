"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { adminClient, userClient } from "@/lib/supabase/server";
import type { FormState } from "../settings/actions";

export async function updateProfile(_: FormState, form: FormData): Promise<FormState> {
  const s = await getSession();
  const name = z.string().trim().min(1, "Enter your name").max(80).safeParse(form.get("full_name"));
  if (!name.success) return { errors: { full_name: name.error.issues[0].message } };
  const db = await userClient();
  await db.auth.updateUser({ data: { full_name: name.data } });
  // Members cannot edit membership rows directly; the server updates only the caller's own row.
  const { error } = await adminClient().from("memberships").update({ full_name: name.data }).eq("user_id", s.userId);
  if (error) return { errors: { _: error.message } };
  revalidatePath("/", "layout");
  return { ok: "Profile saved." };
}

export async function updatePassword(_: FormState, form: FormData): Promise<FormState> {
  await getSession();
  const p = z.object({ password: z.string().min(10, "Use at least 10 characters").max(72), confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" })
    .safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!p.success) return { errors: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const db = await userClient();
  const { error } = await db.auth.updateUser({ password: p.data.password });
  if (error) return { errors: { _: error.message } };
  return { ok: "Password updated." };
}
