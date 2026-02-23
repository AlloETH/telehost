"use client";

import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { type ReactNode } from "react";

export function TonConnectProvider({ children }: { children: ReactNode }) {
  const manifestUrl =
    process.env.NEXT_PUBLIC_TON_CONNECT_MANIFEST_URL ||
    "http://localhost:3000/tonconnect-manifest.json";

  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      {children}
    </TonConnectUIProvider>
  );
}
