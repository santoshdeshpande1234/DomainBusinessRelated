// Server-only configuration. Public values are prefixed NEXT_PUBLIC_ and safe for the browser.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function serverEnv(name: "SUPABASE_SERVICE_ROLE_KEY" | "ENCRYPTION_KEY" | "APP_URL") {
  const v = process.env[name];
  if (!v) throw new Error(`Missing server setting ${name}`);
  return v;
}
