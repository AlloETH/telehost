import type { Metadata } from "next";
import { TonConnectProvider } from "@/components/auth/ton-connect-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenClaw Host - Deploy AI Agents",
  description:
    "Deploy and manage OpenClaw AI agents with one click. 20+ messaging channels, any LLM provider.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)] antialiased">
        <TonConnectProvider>{children}</TonConnectProvider>
      </body>
    </html>
  );
}
