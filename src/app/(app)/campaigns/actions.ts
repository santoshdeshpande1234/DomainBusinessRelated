"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePerm } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { campaignSchema, fieldErrors, statusSchema } from "@/lib/validation";
import { fxSnapshot } from "@/lib/fx";

export type SaveResult = { errors: Record<string, string> };

export async function saveCampaign(id: string | null, raw: unknown): Promise<SaveResult> {
  let s;
  try { s = await requirePerm("campaign:write"); } catch (e) { return { errors: { _: (e as Error).message } }; }
  const parsed = campaignSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const input = { ...parsed.data, custom_industry: parsed.data.industry === "custom" ? parsed.data.custom_industry : null };
  const db = await userClient();

  let current: { currency: string; fx: unknown } | null = null;
  if (id) {
    const { data } = await db.from("campaigns").select("currency, fx").eq("id", id).maybeSingle();
    if (!data) return { errors: { _: "Campaign not found." } };
    current = data;
  }
  // Snapshot the exchange rate when the campaign is created or its currency changes, so budgets stay comparable.
  let fx = current?.fx;
  if (!current || current.currency !== input.currency) {
    try { fx = await fxSnapshot(input.currency, s.workspace.id); } catch (e) { return { errors: { _: (e as Error).message } }; }
  }

  const row = { ...input, region: input.region ?? null, city: input.city ?? null, service_area: input.service_area ?? null, notes: input.notes ?? null, fx };
  const res = id
    ? await db.from("campaigns").update(row).eq("id", id).select("id").single()
    : await db.from("campaigns").insert({ ...row, workspace_id: s.workspace.id, created_by: s.userId }).select("id").single();
  if (res.error) return { errors: { _: "Could not save the campaign. " + res.error.message } };
  revalidatePath("/campaigns");
  revalidatePath("/");
  redirect(`/campaigns/${res.data.id}${id ? "" : "?created=1"}`);
}

export async function setCampaignStatus(id: string, form: FormData) {
  await requirePerm("campaign:write");
  const status = statusSchema.parse(form.get("status"));
  const db = await userClient();
  const { error } = await db.from("campaigns").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/campaigns/${id}`);
  revalidatePath("/campaigns");
  revalidatePath("/");
}

export async function deleteCampaign(id: string) {
  await requirePerm("campaign:delete");
  const db = await userClient();
  const { error } = await db.from("campaigns").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/campaigns");
  revalidatePath("/");
  redirect("/campaigns?deleted=1");
}
