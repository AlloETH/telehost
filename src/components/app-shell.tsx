"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { TonConnectAuthButton } from "@/components/auth/ton-connect-button";
import {
  Bot,
  Rocket,
  CreditCard,
  LayoutDashboard,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode } from "react";

const navItems: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/app", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/app/agents", label: "Agents", icon: Bot },
  { href: "/app/deploy", label: "Deploy", icon: Rocket },
  { href: "/app/billing", label: "Billing", icon: CreditCard },
];

function isActive(pathname: string, item: typeof navItems[number]) {
  if (item.exact) return pathname === item.href;
  return pathname.startsWith(item.href);
}

/** Desktop sidebar layout */
function DesktopShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r border-[var(--border)] bg-[var(--card)]">
        <div className="px-5 py-5">
          <Link href="/app" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white">
              O
            </div>
            <span className="text-base font-bold tracking-tight">OpenClaw</span>
          </Link>
        </div>
        <nav className="flex-1 px-3 py-2">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
            Menu
          </p>
          {navItems.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
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
            href="/app/deploy"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 transition-all"
          >
            <Plus className="h-4 w-4" /> Deploy Instance
          </Link>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-3">
          <div className="text-sm text-[var(--muted-foreground)]">
            {navItems.find((n) => isActive(pathname, n))?.label || "Dashboard"}
          </div>
          <TonConnectAuthButton />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}

/** TMA bottom nav layout */
function TMAShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const tabs = navItems.filter((n) => n.label !== "Overview"); // TMA doesn't need overview

  return (
    <>
      <div
        className="tma-root min-h-screen"
        style={{ paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {children}
      </div>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border)]"
        style={{
          background: "rgba(var(--background-rgb, 9, 9, 11), 0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
          {tabs.map((tab) => {
            const active = isActive(pathname, tab);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[44px] rounded-xl transition-colors ${
                  active
                    ? "text-[var(--primary)]"
                    : "text-[var(--muted-foreground)] active:text-[var(--foreground)]"
                }`}
              >
                <tab.icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { isTMA } = useApp();

  if (isTMA) {
    return <TMAShell>{children}</TMAShell>;
  }

  return <DesktopShell>{children}</DesktopShell>;
}
