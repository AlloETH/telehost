"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TonConnectAuthButton } from "@/components/auth/ton-connect-button";
import { type ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/agents", label: "Agents" },
  { href: "/dashboard/billing", label: "Billing" },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-4 py-4">
          <Link href="/dashboard" className="text-lg font-bold">
            Telehost
          </Link>
        </div>
        <nav className="flex-1 px-2 py-4">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" &&
                pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-[var(--accent)] text-[var(--foreground)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-3">
          <div />
          <TonConnectAuthButton />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
