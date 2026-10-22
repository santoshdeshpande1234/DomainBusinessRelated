import "server-only";
import { adminClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";

/** Decrypted credentials for a provider, for server-side adapters only. Never return this to the browser. */
export async function getCredentials(workspaceId: string, provider: string): Promise<Record<string, string> | null> {
  const { data } = await adminClient().from("integrations").select("secret, hint").eq("workspace_id", workspaceId).eq("provider", provider).maybeSingle();
  if (!data?.secret) return null;
  const secrets = JSON.parse(decrypt(data.secret, serverEnv("ENCRYPTION_KEY"))) as Record<string, string>;
  return { ...(data.hint as Record<string, string>), ...secrets };
}

/** Records whether a provider's credentials worked the last time they were used. */
export async function markIntegration(workspaceId: string, provider: string, status: "verified" | "failed") {
  await adminClient().from("integrations").update({ status }).eq("workspace_id", workspaceId).eq("provider", provider).neq("status", status);
}
