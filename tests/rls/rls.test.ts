// Row-level security checks against a local Supabase stack (`npx supabase start`). Skipped when it isn't running.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.TEST_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.TEST_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const up = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON } }).then((r) => r.ok).catch(() => false);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const svc = createClient(URL, SERVICE, opts);
const run = Date.now().toString(36);
const PW = "test-password-123";
const ids: string[] = [];
const wsIds: string[] = [];

async function user(tag: string) {
  const email = `${tag}-${run}@test.local`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  ids.push(data.user.id);
  return { id: data.user.id, email };
}
async function login(email: string) {
  const c = createClient(URL, ANON, opts);
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw error;
  return c;
}
const campaign = (ws: string, by: string, name = "Test campaign") => ({
  workspace_id: ws, created_by: by, name, industry: "healthcare", country: "India", language: "English", currency: "INR",
  objectives: ["lead_generation"], domain_budget: 1000, prospect_budget: 500, max_prospects: 10, min_quality_score: 50,
  extensions: [".com"], fx: { currency: "INR", usd_per_unit: 0.012, fetched_at: new Date().toISOString(), provider: "test" },
});

describe.skipIf(!up)("row-level security", () => {
  let A: string, B: string;
  let admin: SupabaseClient, member: SupabaseClient, viewer: SupabaseClient, other: SupabaseClient;
  let u: Record<string, { id: string; email: string }>;
  let campaignA: string;

  beforeAll(async () => {
    const ws = await svc.from("workspaces").insert([{ name: `A ${run}` }, { name: `B ${run}` }]).select("id");
    [A, B] = ws.data!.map((w) => w.id);
    wsIds.push(A, B);
    u = { admin: await user("admin"), member: await user("member"), viewer: await user("viewer"), other: await user("other") };
    const { error } = await svc.from("memberships").insert([
      { workspace_id: A, user_id: u.admin.id, email: u.admin.email, role: "admin" },
      { workspace_id: A, user_id: u.member.id, email: u.member.email, role: "member" },
      { workspace_id: A, user_id: u.viewer.id, email: u.viewer.email, role: "viewer" },
      { workspace_id: B, user_id: u.other.id, email: u.other.email, role: "admin" },
    ]);
    if (error) throw error;
    [admin, member, viewer, other] = await Promise.all([login(u.admin.email), login(u.member.email), login(u.viewer.email), login(u.other.email)]);
    const c = await member.from("campaigns").insert(campaign(A, u.member.id)).select("id").single();
    if (c.error) throw c.error;
    campaignA = c.data.id;
    await svc.from("integrations").insert({ workspace_id: A, provider: "hunter", secret: "ciphertext", hint: { api_key: "••••1234" }, status: "saved_unverified", updated_by: u.admin.id });
  });

  afterAll(async () => {
    if (wsIds.length) await svc.from("workspaces").delete().in("id", wsIds);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  });

  it("anonymous visitors see nothing", async () => {
    const anon = createClient(URL, ANON, opts);
    for (const t of ["workspaces", "campaigns", "memberships", "integrations", "audit_logs"]) {
      const { data } = await anon.from(t).select("*").limit(1);
      expect(data ?? [], t).toEqual([]);
    }
  });

  it("workspaces are isolated", async () => {
    expect((await other.from("campaigns").select("id").eq("id", campaignA)).data).toEqual([]);
    expect((await other.from("workspaces").select("id")).data!.map((w) => w.id)).toEqual([B]);
    await other.from("campaigns").update({ name: "hijacked" }).eq("id", campaignA);
    expect((await svc.from("campaigns").select("name").eq("id", campaignA).single()).data!.name).toBe("Test campaign");
    const ins = await other.from("campaigns").insert(campaign(A, u.other.id));
    expect(ins.error).not.toBeNull();
  });

  it("viewers read but cannot write", async () => {
    expect((await viewer.from("campaigns").select("id")).data!.length).toBe(1);
    expect((await viewer.from("campaigns").insert(campaign(A, u.viewer.id))).error).not.toBeNull();
    const upd = await viewer.from("campaigns").update({ name: "viewer edit" }).eq("id", campaignA).select();
    expect(upd.data ?? []).toEqual([]);
  });

  it("members write campaigns as themselves but cannot delete or move them", async () => {
    expect((await member.from("campaigns").insert(campaign(A, u.admin.id))).error).not.toBeNull(); // spoofed creator
    expect((await member.from("campaigns").update({ status: "active" }).eq("id", campaignA).select()).data!.length).toBe(1);
    expect((await member.from("campaigns").update({ workspace_id: B }).eq("id", campaignA)).error).not.toBeNull();
    expect((await member.from("campaigns").update({ created_by: u.admin.id }).eq("id", campaignA)).error).not.toBeNull();
    await member.from("campaigns").delete().eq("id", campaignA);
    expect((await svc.from("campaigns").select("id").eq("id", campaignA)).data!.length).toBe(1);
  });

  it("only admins manage the team, and the last admin stays", async () => {
    expect((await member.from("memberships").update({ role: "admin" }).eq("user_id", u.member.id).select()).data ?? []).toEqual([]);
    expect((await member.from("invites").insert({ workspace_id: A, email: `x-${run}@test.local`, role: "admin" })).error).not.toBeNull();
    const demote = await admin.from("memberships").update({ role: "member" }).eq("user_id", u.admin.id);
    expect(demote.error?.message).toMatch(/at least one active admin/);
    const del = await admin.from("memberships").delete().eq("user_id", u.admin.id);
    expect(del.error?.message).toMatch(/at least one active admin/);
  });

  it("integration secrets are never readable from a browser session", async () => {
    for (const c of [admin, member]) {
      expect((await c.from("integrations").select("secret")).error).not.toBeNull();
      expect((await c.from("integrations").select("provider, hint")).data).toEqual([{ provider: "hunter", hint: { api_key: "••••1234" } }]);
    }
    const w = await admin.from("integrations").insert({ workspace_id: A, provider: "serpapi", hint: {}, status: "verified" });
    expect(w.error).not.toBeNull();
  });

  it("audit log is admin-only, written by triggers, and read-only", async () => {
    const { data } = await admin.from("audit_logs").select("action, actor_email, resource_id").eq("resource_id", campaignA).order("id");
    expect(data!.map((r) => r.action)).toEqual(["campaigns.insert", "campaigns.update"]);
    expect(data![0].actor_email).toBe(u.member.email);
    expect((await member.from("audit_logs").select("id")).data).toEqual([]);
    expect((await admin.from("audit_logs").insert({ workspace_id: A, action: "fake", resource_type: "x" })).error).not.toBeNull();
    expect((await admin.from("fx_rates").insert({ base: "XXX", rates: {}, provider: "fake" })).error).not.toBeNull();
    expect((await admin.from("api_usage").insert({ workspace_id: A, provider: "fake", operation: "x" })).error).not.toBeNull();
  });

  it("accepts a pending invite on first sign-in, once", async () => {
    const email = `invitee-${run}@test.local`;
    expect((await admin.from("invites").insert({ workspace_id: A, email, role: "viewer", invited_by: u.admin.id })).error).toBeNull();
    const nu = await user("invitee").then(async () => ({ email: `invitee-${run}@test.local` }));
    const c = await login(nu.email);
    expect((await c.rpc("accept_invite")).data).toBe(A);
    expect((await c.from("memberships").select("role").eq("email", email).single()).data!.role).toBe("viewer");
    expect((await admin.from("invites").select("status").eq("email", email).single()).data!.status).toBe("accepted");
    const stranger = await login((await user("stranger")).email);
    expect((await stranger.rpc("accept_invite")).data).toBeNull();
  });
  it("domains, prospects and evidence stay in their workspace", async () => {
    const dom = await member.from("domains").insert({ workspace_id: A, campaign_id: campaignA, name: `dental${run}.in`, tld: ".in", origin: "manual", created_by: u.member.id }).select("id").single();
    expect(dom.error).toBeNull();
    const pro = await member.from("prospects").insert({ workspace_id: A, campaign_id: campaignA, name: "Smile Dental", origin: "manual", dedupe_key: "smiledental|pune" }).select("id").single();
    expect(pro.error).toBeNull();
    expect((await member.from("evidence").insert({ workspace_id: A, campaign_id: campaignA, prospect_id: pro.data!.id, kind: "manual", label: "x", source_name: "test", created_by: u.member.id })).error).toBeNull();

    // Other workspace: cannot see, write into, or point rows at this campaign.
    for (const t of ["domains", "prospects", "evidence"]) expect((await other.from(t).select("*")).data, t).toEqual([]);
    expect((await other.from("domains").insert({ workspace_id: B, campaign_id: campaignA, name: `x${run}.com`, tld: ".com", origin: "manual" })).error?.message).toMatch(/does not belong/);
    expect((await other.from("prospects").update({ name: "hijack" }).eq("id", pro.data!.id).select()).data ?? []).toEqual([]);

    // Viewers read only; evidence is append-only and attributed.
    expect((await viewer.from("domains").select("id")).data!.length).toBe(1);
    expect((await viewer.from("domains").update({ status: "approved" }).eq("id", dom.data!.id).select()).data ?? []).toEqual([]);
    expect((await viewer.from("prospects").insert({ workspace_id: A, campaign_id: campaignA, name: "V", origin: "manual", dedupe_key: "v|" })).error).not.toBeNull();
    expect((await member.from("evidence").update({ label: "edited" }).eq("prospect_id", pro.data!.id)).error).not.toBeNull();
    expect((await member.from("evidence").insert({ workspace_id: A, campaign_id: campaignA, domain_id: dom.data!.id, kind: "x", label: "x", source_name: "x", created_by: u.admin.id })).error).not.toBeNull();
    expect((await member.from("domains").update({ campaign_id: campaignA, workspace_id: B }).eq("id", dom.data!.id)).error).not.toBeNull();

    // Duplicates are rejected by the database too; status decisions are audited.
    expect((await member.from("domains").insert({ workspace_id: A, campaign_id: campaignA, name: `dental${run}.in`, tld: ".in", origin: "manual" })).error).not.toBeNull();
    expect((await member.from("prospects").insert({ workspace_id: A, campaign_id: campaignA, name: "Smile Dental", origin: "manual", dedupe_key: "smiledental|pune" })).error).not.toBeNull();
    await member.from("domains").update({ status: "approved", updated_by: u.member.id }).eq("id", dom.data!.id);
    const log = await admin.from("audit_logs").select("action, actor_email, detail").eq("resource_id", dom.data!.id);
    expect(log.data).toEqual([{ action: "domains.update", actor_email: u.member.email, detail: expect.objectContaining({ status: "approved", from_status: "candidate" }) }]);

    // The research cache is server-only.
    expect((await admin.from("research_cache").select("*")).error).not.toBeNull();
  });

  it("competitors, financial models and previews stay with their prospect and workspace", async () => {
    const pro = await member.from("prospects").insert({ workspace_id: A, campaign_id: campaignA, name: "Ortho Care", origin: "manual", dedupe_key: `orthocare${run}|` }).select("id").single();
    expect(pro.error).toBeNull();
    const p = pro.data!.id;
    expect((await member.from("competitors").insert({ workspace_id: A, campaign_id: campaignA, prospect_id: p, name: "Rival", origin: "manual" })).error).toBeNull();
    expect((await member.from("financial_models").insert({ workspace_id: A, campaign_id: campaignA, prospect_id: p, inputs: { visits: { value: 1, basis: "actual" } } })).error).toBeNull();
    const web = await member.from("website_previews").insert({ workspace_id: A, campaign_id: campaignA, prospect_id: p, content: { brand: { name: "Ortho Care" } } }).select("id, token, share_enabled").single();
    expect(web.error).toBeNull();
    expect(web.data!.token).toMatch(/^[0-9a-f]{64}$/);
    expect(web.data!.share_enabled).toBe(false);

    const inv = await member.from("site_inventories").insert({ workspace_id: A, campaign_id: campaignA, prospect_id: p, inventory: { pages: [] } }).select("id").single();
    expect(inv.error).toBeNull();
    expect((await other.from("site_inventories").insert({ workspace_id: B, campaign_id: campaignA, prospect_id: p })).error?.message).toMatch(/does not belong/);

    // Other workspace and anonymous visitors see none of it; the browser cannot read previews by token.
    const anon = createClient(URL, ANON, opts);
    for (const t of ["competitors", "financial_models", "website_previews", "site_inventories"]) {
      expect((await other.from(t).select("*")).data, t).toEqual([]);
      expect((await anon.from(t).select("*")).data ?? [], t).toEqual([]);
    }
    expect((await other.from("website_previews").insert({ workspace_id: B, campaign_id: campaignA, prospect_id: p })).error?.message).toMatch(/does not belong/);
    expect((await other.from("website_previews").update({ share_enabled: true }).eq("id", web.data!.id).select()).data ?? []).toEqual([]);

    // A child must sit in its prospect's campaign, and a proposed domain must come from the same campaign.
    const c2 = await member.from("campaigns").insert(campaign(A, u.member.id, "Second")).select("id").single();
    expect((await member.from("competitors").insert({ workspace_id: A, campaign_id: c2.data!.id, prospect_id: p, name: "X", origin: "manual" })).error?.message).toMatch(/prospect does not belong/);
    const d2 = await member.from("domains").insert({ workspace_id: A, campaign_id: c2.data!.id, name: `other${run}.com`, tld: ".com", origin: "manual" }).select("id").single();
    expect((await member.from("website_previews").update({ domain_id: d2.data!.id }).eq("id", web.data!.id)).error?.message).toMatch(/domain does not belong/);

    // Viewers read only; sharing changes are audited; a shared link can't be swapped silently.
    expect((await viewer.from("website_previews").select("id")).data!.length).toBe(1);
    expect((await viewer.from("website_previews").update({ share_enabled: true }).eq("id", web.data!.id).select()).data ?? []).toEqual([]);
    expect((await viewer.from("financial_models").update({ inputs: {} }).eq("prospect_id", p).select()).data ?? []).toEqual([]);
    await member.from("website_previews").update({ status: "ready", share_enabled: true, updated_by: u.member.id }).eq("id", web.data!.id);
    expect((await member.from("website_previews").update({ token: "f".repeat(64) }).eq("id", web.data!.id)).error?.message).toMatch(/turn sharing off/);
    const log = await admin.from("audit_logs").select("action, detail").eq("resource_id", web.data!.id).eq("action", "website_previews.update");
    expect(log.data![0].detail).toEqual(expect.objectContaining({ status: "ready", changed: expect.arrayContaining(["share_enabled"]) }));

    // Versions: members snapshot their own workspace's previews; nobody edits a snapshot or crosses campaigns.
    const ver = { workspace_id: A, campaign_id: campaignA, preview_id: web.data!.id, version: 1, reason: "Before rebuild", content: { brand: { name: "Ortho Care" } }, theme: "harbor", layout: "split" };
    expect((await member.from("website_preview_versions").insert({ ...ver, created_by: u.member.id })).error).toBeNull();
    expect((await member.from("website_preview_versions").insert({ ...ver, version: 2, campaign_id: c2.data!.id, created_by: u.member.id })).error?.message).toMatch(/does not belong/);
    expect((await viewer.from("website_preview_versions").insert({ ...ver, version: 3, created_by: u.viewer.id })).error).not.toBeNull();
    expect((await viewer.from("website_preview_versions").select("version")).data!.length).toBe(1);
    expect((await other.from("website_preview_versions").select("*")).data).toEqual([]);
    expect((await anon.from("website_preview_versions").select("*")).data ?? []).toEqual([]);
    expect((await member.from("website_preview_versions").update({ reason: "changed" }).eq("preview_id", web.data!.id)).error).not.toBeNull();
  });
});
