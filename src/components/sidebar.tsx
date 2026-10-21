"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Activity, FolderKanban, KeyRound, LayoutDashboard, Lock, Menu, ScrollText, Settings, UserRound, Users, X } from "lucide-react";

type Item = { href: string; label: string; icon: React.ElementType; locked?: boolean };

export function Sidebar({ workspace, user, role, showAudit, modules }: {
  workspace: string; user: string; role: string; showAudit: boolean; modules: { key: string; label: string }[];
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const groups: [string, Item[]][] = [
    ["", [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/campaigns", label: "Campaigns", icon: FolderKanban },
    ]],
    ["Coming next", modules.map((m) => ({ href: `/modules/${m.key}`, label: m.label, icon: Lock, locked: true }))],
    ["Workspace", [
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/settings/team", label: "Team", icon: Users },
      { href: "/settings/integrations", label: "Integrations", icon: KeyRound },
      { href: "/usage", label: "API usage", icon: Activity },
      ...(showAudit ? [{ href: "/audit", label: "Audit log", icon: ScrollText }] : []),
    ]],
  ];
  const active = (href: string) => (href === "/" ? path === "/" : href === "/settings" ? path === "/settings" : path.startsWith(href));

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Link href="/" className="text-[15px] font-semibold tracking-tight" onClick={() => setOpen(false)}>Domain2Revenue <span className="text-accent">AI</span></Link>
        <p className="mt-0.5 truncate text-xs text-faint">{workspace}</p>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map(([label, items]) => items.length > 0 && (
          <div key={label || "main"}>
            {label && <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">{label}</p>}
            <ul className="space-y-0.5">
              {items.map((it) => (
                <li key={it.href}>
                  <Link href={it.href} onClick={() => setOpen(false)} aria-current={active(it.href) ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm ${active(it.href) ? "bg-accent-soft font-medium text-accent" : it.locked ? "text-faint hover:bg-surface-2" : "text-muted hover:bg-surface-2 hover:text-ink"}`}>
                    <it.icon className="size-4 shrink-0" aria-hidden />{it.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line p-3">
        <Link href="/account" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-surface-2">
          <UserRound className="size-4 text-faint" aria-hidden />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm">{user}</span><span className="block text-xs capitalize text-faint">{role}</span></span>
        </Link>
        <form action="/auth/signout" method="post"><button className="btn-ghost mt-1 w-full justify-start text-xs">Sign out</button></form>
      </div>
    </nav>
  );

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <span className="text-sm font-semibold">Domain2Revenue <span className="text-accent">AI</span></span>
        <button className="btn-ghost p-1.5" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
      </header>
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-60 border-r border-line bg-surface lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-surface shadow-xl">
            <button className="btn-ghost absolute right-2 top-4 p-1.5" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
