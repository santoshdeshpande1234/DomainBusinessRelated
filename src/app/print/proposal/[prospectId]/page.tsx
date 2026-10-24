import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { ProposalDocument } from "@/components/proposal-document";
import type { Proposal } from "@/lib/proposals/proposal";
import { PrintBar } from "./print-bar";

// The proposal on its own page, sized for A4, for "Save as PDF". Only workspace members can open it.
export const metadata = { title: "Proposal", robots: { index: false, follow: false } };

export default async function PrintProposal({ params }: { params: Promise<{ prospectId: string }> }) {
  await getSession();
  const { prospectId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(prospectId)) notFound();
  const db = await userClient();
  const { data: row } = await db.from("proposals").select("content, status, prospect_id").eq("prospect_id", prospectId).maybeSingle();
  const p = row?.content as Proposal | undefined;
  if (!p?.title) notFound();
  return (
    <div className="min-h-screen bg-neutral-100 print:bg-white">
      <PrintBar status={row!.status} file={`${p.title.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-")}.pdf`} />
      <div className="mx-auto max-w-[210mm] bg-white px-[16mm] py-[18mm] shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <ProposalDocument p={p} />
      </div>
      <style>{`@page { size: A4; margin: 16mm 16mm 18mm; } @media print { .break-after-avoid { break-after: avoid; } .break-inside-avoid { break-inside: avoid; } }`}</style>
    </div>
  );
}
