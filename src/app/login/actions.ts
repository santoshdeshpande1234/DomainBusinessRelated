"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { userClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { safeNext } from "@/lib/redirect";

export type AuthState = { error?: string; info?: string } | undefined;
const email = z.string().trim().toLowerCase().email();

function callback(next: string) {
  return `${serverEnv("APP_URL")}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function passwordSignIn(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password: z.string().min(1) }).safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };
  const supabase = await userClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Email or password is incorrect." };
  redirect(safeNext(form.get("next")));
}

export async function magicLink(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const supabase = await userClient();
  // shouldCreateUser: false keeps the app invite-only.
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data, options: { shouldCreateUser: false, emailRedirectTo: callback(safeNext(form.get("next"))) } });
  // Same message either way, so the form does not reveal which emails have accounts.
  if (error && error.status !== 400 && error.status !== 422) return { error: "Could not send the link right now. Please try again shortly." };
  return { info: "If this email has access, a sign-in link is on its way." };
}

export async function resetPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: "Enter your email address first." };
  const supabase = await userClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: callback("/account?reset=1") });
  return { info: "If this email has access, a password reset link is on its way." };
}

export async function googleSignIn(form: FormData) {
  const supabase = await userClient();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback(safeNext(form.get("next"))) } });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}
