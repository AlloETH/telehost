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
          const active = isActive(tab);
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
  );
}
