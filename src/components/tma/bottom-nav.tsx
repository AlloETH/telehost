"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Bot, Rocket, CreditCard } from "lucide-react";

const tabs = [
  { href: "/tma", label: "Agents", icon: Bot, exact: true },
  { href: "/tma/deploy", label: "Deploy", icon: Rocket },
  { href: "/tma/billing", label: "Billing", icon: CreditCard },
];

export function BottomNav() {
  const pathname = usePathname();

  function isActive(tab: (typeof tabs)[number]) {
    if (tab.exact) {
      return pathname === tab.href;
    }
    return pathname.startsWith(tab.href);
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border)] bg-[var(--background)]/95 backdrop-blur-sm safe-area-pb">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const active = isActive(tab);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
                active
                  ? "text-[var(--primary)]"
                  : "text-[var(--muted-foreground)]"
              }`}
            >
              <tab.icon className="h-5 w-5" />
              <span className="text-xs font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
