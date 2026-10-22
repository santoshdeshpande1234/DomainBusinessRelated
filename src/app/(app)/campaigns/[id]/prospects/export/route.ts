import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { opportunities, toCsv, type Audit } from "@/lib/discovery/prospects";

// Exports the campaign's prospects with the user's own session, so row-level security applies.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getSession();
  const db = await userClient();
  const { data: c } = await db.from("campaigns").select("name").eq("id", id).maybeSingle();
  if (!c) return new NextResponse("Not found", { status: 404 });
  const { data = [] } = await db.from("prospects").select("*").eq("campaign_id", id).order("score", { ascending: false, nullsFirst: false }).limit(5000);
  const head = ["name", "website", "phone", "email", "address", "city", "region", "country", "category", "contact_name", "contact_role", "score", "confidence", "status", "opportunities", "source", "source_url", "notes"];
  const rows = data!.map((p) => [p.name, p.website, p.phone, p.email, p.address, p.city, p.region, p.country, p.category, p.contact_name, p.contact_role,
    p.score, p.confidence, p.status, opportunities(p.audit as Audit | null, !!p.website).join("; "), p.origin, p.origin_url, p.notes]);
  const file = `${c.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-prospects.csv`;
  return new NextResponse(toCsv([head, ...rows]), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${file}"`, "cache-control": "no-store" },
  });
}
