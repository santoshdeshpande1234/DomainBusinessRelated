import { Sidebar } from "@/components/sidebar";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { MODULES } from "@/lib/options";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  return (
    <div className="min-h-screen">
      <Sidebar workspace={s.workspace.name} user={s.name || s.email} role={s.role} showAudit={can(s.role, "audit:read")}
        modules={MODULES.map(({ key, label }) => ({ key, label }))} />
      <main className="lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
