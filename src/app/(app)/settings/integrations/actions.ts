"use server";
import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/session";
import { adminClient } from "@/lib/supabase/server";
import { PROVIDERS } from "@/lib/options";
import { encrypt, mask } from "@/lib/crypto";
import { getCredentials } from "@/lib/integrations";
import { serverEnv } from "@/lib/env";
import type { FormState } from "../actions";

// Secrets are encrypted here and written with the service role; browser sessions can never read the secret column.
export async function saveIntegration(providerKey: string, _: FormState, form: FormData): Promise<FormState> {
  let s;
  try { s = await requirePerm("integration:write"); } catch (e) { return { errors: { _: (e as Error).message } }; }
  const provider = PROVIDERS.find((p) => p.key === providerKey);
  if (!provider) return { errors: { _: "Unknown provider." } };
  const existing = await getCredentials(s.workspace.id, provider.key).catch(() => null);

  const values: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const f of provider.fields) {
    const v = String(form.get(f.name) ?? "").trim();
    if (v.length > 500) errors[f.name] = "Too long";
    else if (v) values[f.name] = v;
    else if (f.secret && existing?.[f.name]) values[f.name] = existing[f.name]; // blank secret = keep the saved one
    else if (f.secret) errors[f.name] = "Required";
  }
  if (Object.keys(errors).length) return { errors };

  const secrets = Object.fromEntries(provider.fields.filter((f) => f.secret).map((f) => [f.name, values[f.name]]));
  const hint = Object.fromEntries(provider.fields.filter((f) => values[f.name]).map((f) => [f.name, mask(values[f.name], f.secret)]));
  const { error } = await adminClient().from("integrations").upsert({
    workspace_id: s.workspace.id, provider: provider.key, secret: encrypt(JSON.stringify(secrets), serverEnv("ENCRYPTION_KEY")),
    hint, status: "saved_unverified", updated_by: s.userId, updated_at: new Date().toISOString(),
  });
  if (error) return { errors: { _: error.message } };
  revalidatePath("/settings/integrations");
  return { ok: `${provider.name} saved. It will be checked the first time Phase ${provider.phase} uses it.` };
}

export async function removeIntegration(providerKey: string) {
  const s = await requirePerm("integration:write");
  // Record the remover on the row first so the audit trail names them (server writes have no user session).
  const db = adminClient();
  await db.from("integrations").update({ updated_by: s.userId }).eq("workspace_id", s.workspace.id).eq("provider", providerKey);
  const { error } = await db.from("integrations").delete().eq("workspace_id", s.workspace.id).eq("provider", providerKey);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/integrations");
}
