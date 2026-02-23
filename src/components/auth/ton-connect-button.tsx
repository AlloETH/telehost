"use client";

import {
  useTonConnectUI,
  useTonWallet,
  useTonAddress,
} from "@tonconnect/ui-react";
import { useCallback, useEffect, useState } from "react";

export function TonConnectAuthButton() {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const address = useTonAddress();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleConnect = useCallback(async () => {
    // Fetch challenge payload from our backend
    const res = await fetch("/api/auth/ton-proof/payload");
    const { payload } = await res.json();

    // Set the proof payload before connecting
    tonConnectUI.setConnectRequestParameters({
      state: "ready",
      value: { tonProof: payload },
    });

    // Open the connect modal
    await tonConnectUI.openModal();
  }, [tonConnectUI]);

  // When wallet connects with proof, verify it
  useEffect(() => {
    if (!wallet?.connectItems?.tonProof || isAuthenticating) return;

    const proof = wallet.connectItems.tonProof;
    if ("proof" in proof) {
      setIsAuthenticating(true);

      fetch("/api/auth/ton-proof/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: wallet.account.address,
          network: wallet.account.chain,
          proof: {
            timestamp: proof.proof.timestamp,
            domain: proof.proof.domain,
            payload: proof.proof.payload,
            signature: proof.proof.signature,
            stateInit: wallet.account.walletStateInit,
          },
        }),
      })
        .then((res) => {
          if (res.ok) {
            window.location.href = "/dashboard";
          }
        })
        .finally(() => setIsAuthenticating(false));
    }
  }, [wallet, isAuthenticating]);

  if (wallet) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-[var(--muted-foreground)]">
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </span>
        <button
          onClick={() => tonConnectUI.disconnect()}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent)] transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isAuthenticating}
      className="rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
    >
      {isAuthenticating ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}
