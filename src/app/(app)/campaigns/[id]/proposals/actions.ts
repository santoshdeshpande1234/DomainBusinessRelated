"use server";
import { requirePerm } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { generateProposal } from "../prospects/[prospectId]/proposal/actions";
import type { StepResult } from "../domains/actions";

/** Drafts the next missing proposal in the campaign; the button repeats it until none are left. */
export async function draftNextProposal(campaignId: string): Promise<StepResult> {
  try {
    await requirePerm("campaign:write");
    const db = await userClient();
    const [{ data: ps = [] }, { data: webs = [] }, { data: props = [] }] = await Promise.all([
      db.from("prospects").select("id, name").eq("campaign_id", campaignId).eq("status", "selected"),
      db.from("website_previews").select("prospect_id, content").eq("campaign_id", campaignId),
      db.from("proposals").select("prospect_id").eq("campaign_id", campaignId),
    ]);
    const has = new Set(props!.map((x) => x.prospect_id));
    const ready = new Set(webs!.filter((w) => w.content?.growth).map((w) => w.prospect_id));
    const todo = ps!.filter((p) => ready.has(p.id) && !has.has(p.id));
    if (!todo.length) return { ok: "Every selected prospect with a growth plan has a proposal." };
    const r = await generateProposal(campaignId, todo[0].id);
    if (r.error) return { error: `${todo[0].name}: ${r.error}` };
    return { ok: `Drafted ${todo[0].name}.`, remaining: todo.length - 1 };
  } catch (e) { return { error: (e as Error).message }; }
}
