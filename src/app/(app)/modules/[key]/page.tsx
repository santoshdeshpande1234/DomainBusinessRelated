import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { MODULES } from "@/lib/options";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const m = MODULES.find((x) => x.key === key);
  return { title: m?.label ?? "Module" };
}

export default async function ModulePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const m = MODULES.find((x) => x.key === key);
  if (!m) notFound();
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-surface-2"><Lock className="size-5 text-faint" /></div>
      <h1 className="mt-4 text-xl font-semibold">{m.label}</h1>
      <p className="mt-2 text-sm text-muted">{m.text}</p>
      <p className="mt-4 text-xs text-faint">Arrives in Phase {m.phase}. It will use the campaigns and integrations you set up now.</p>
      <div className="mt-6 flex justify-center gap-2"><Link href="/campaigns" className="btn-secondary">View campaigns</Link><Link href="/settings/integrations" className="btn-ghost">Integrations</Link></div>
    </div>
  );
}
