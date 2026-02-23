"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TonConnectAuthButton } from "@/components/auth/ton-connect-button";
import { type ReactNode } from "react";
import { LayoutDashboard, Bot, CreditCard, Plus, type LucideIcon } from "lucide-react";

const navItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/agents", label: "Agents", icon: Bot },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-[var(--border)] bg-[var(--card)]">
        <div className="px-5 py-5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white">
              T
            </div>
            <span className="text-base font-bold tracking-tight">Telehost</span>
          </Link>
        </div>
        <nav className="flex-1 px-3 py-2">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
            Menu
          </p>
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" &&
                pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-[var(--primary)]/10 text-[var(--primary)] font-medium"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
                }`}
              >
                <item.icon className="h-4 w-4 opacity-60" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-[var(--border)] px-3 py-3">
          <Link
            href="/dashboard/agents/new"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 transition-all"
          >
            <Plus className="h-4 w-4" /> Deploy Agent
          </Link>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-3">
          <div className="text-sm text-[var(--muted-foreground)]">
            {navItems.find(
              (n) =>
                pathname === n.href ||
                (n.href !== "/dashboard" && pathname.startsWith(n.href)),
            )?.label || "Dashboard"}
          </div>
          <TonConnectAuthButton />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
