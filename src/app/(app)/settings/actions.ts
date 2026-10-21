"use server";
import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { fieldErrors, workspaceSchema } from "@/lib/validation";

export type FormState = { errors?: Record<string, string>; ok?: string } | undefined;

export async function updateWorkspace(_: FormState, form: FormData): Promise<FormState> {
  let s;
  try { s = await requirePerm("workspace:write"); } catch (e) { return { errors: { _: (e as Error).message } }; }
  const parsed = workspaceSchema.safeParse({
    name: form.get("name"), default_currency: form.get("default_currency"), default_language: form.get("default_language"),
    company_name: form.get("company_name"), company_website: form.get("company_website"), sender_name: form.get("sender_name"),
    monthly_api_budget_usd: form.get("monthly_api_budget_usd"),
    service_pricing: { website_build: form.get("website_build"), website_redesign: form.get("website_redesign"), monthly_retainer: form.get("monthly_retainer") },
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const db = await userClient();
  const { error } = await db.from("workspaces").update({ ...parsed.data, monthly_api_budget_usd: parsed.data.monthly_api_budget_usd ?? null }).eq("id", s.workspace.id);
  if (error) return { errors: { _: error.message } };
  revalidatePath("/", "layout");
  return { ok: "Settings saved." };
}
