"use client";

import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { type ReactNode } from "react";

export function TonConnectProvider({ children }: { children: ReactNode }) {
  const manifestUrl =
    process.env.NEXT_PUBLIC_TON_CONNECT_MANIFEST_URL ||
    `${typeof window !== "undefined" ? window.location.origin : ""}/tonconnect-manifest.json`;

  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      {children}
    </TonConnectUIProvider>
  );
}
