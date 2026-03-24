import Script from "next/script";
import { AppProvider } from "@/components/app-provider";
import { AppShell } from "@/components/app-shell";

export const metadata = {
  title: "OpenClaw - Deploy AI Agents",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Load Telegram WebApp SDK — no-ops on desktop */}
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      <AppProvider>
        <AppShell>{children}</AppShell>
      </AppProvider>
    </>
  );
}
