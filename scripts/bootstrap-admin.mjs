// Creates the first workspace and its admin. Run once per environment:
//   node --env-file=.env.local scripts/bootstrap-admin.mjs --email you@company.com --workspace "Acme Growth" [--name "Your Name"] [--password "..."]
// Without --password, Supabase emails a sign-in invite instead.
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values: a } = parseArgs({ options: { email: { type: "string" }, workspace: { type: "string" }, name: { type: "string" }, password: { type: "string" }, currency: { type: "string", default: "USD" } } });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
if (!a.email || !a.workspace) throw new Error("Usage: --email <email> --workspace <name> [--name <full name>] [--password <password>]");
const email = a.email.trim().toLowerCase();
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: list, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 });
if (listErr) throw listErr;
let user = list.users.find((u) => u.email?.toLowerCase() === email);
if (!user) {
  const res = a.password
    ? await db.auth.admin.createUser({ email, password: a.password, email_confirm: true, user_metadata: { full_name: a.name } })
    : await db.auth.admin.inviteUserByEmail(email, { data: { full_name: a.name }, redirectTo: `${process.env.APP_URL ?? "http://localhost:3000"}/auth/callback?next=${encodeURIComponent("/account?welcome=1")}` });
  if (res.error) throw res.error;
  user = res.data.user;
}
const { data: existing } = await db.from("memberships").select("workspace_id").eq("user_id", user.id).maybeSingle();
if (existing) {
  console.log(`${email} is already in workspace ${existing.workspace_id}. Nothing to do.`);
  process.exit(0);
}
const { data: ws, error: wsErr } = await db.from("workspaces").insert({ name: a.workspace, default_currency: a.currency, company_name: a.workspace, sender_name: a.name ?? "" }).select("id").single();
if (wsErr) throw wsErr;
const { error: mErr } = await db.from("memberships").insert({ workspace_id: ws.id, user_id: user.id, email, full_name: a.name ?? null, role: "admin" });
if (mErr) throw mErr;
console.log(`Created workspace "${a.workspace}" (${ws.id}) with admin ${email}.${a.password ? "" : " An invite email was sent."}`);
