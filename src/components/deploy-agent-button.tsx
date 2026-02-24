"use client";

import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { useCallback, useEffect, useRef } from "react";

export function DeployAgentButton({
  className,
  children,
  href = "/dashboard/agents/new",
}: {
  className?: string;
  children: React.ReactNode;
  href?: string;
}) {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const pendingRedirect = useRef<string | null>(null);

  // After wallet connects + proof verifies, redirect to the intended page
  useEffect(() => {
    if (!wallet?.connectItems?.tonProof || !pendingRedirect.current) return;

    const proof = wallet.connectItems.tonProof;
    if (!("proof" in proof)) return;

    const target = pendingRedirect.current;
    pendingRedirect.current = null;

    fetch("/api/auth/ton-proof/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: wallet.account.address,
        network: wallet.account.chain,
        publicKey: wallet.account.publicKey,
        proof: {
          timestamp: proof.proof.timestamp,
          domain: proof.proof.domain,
          payload: proof.proof.payload,
          signature: proof.proof.signature,
          stateInit: wallet.account.walletStateInit,
        },
      }),
    }).then((res) => {
      if (res.ok) {
        window.location.href = target;
      }
    });
  }, [wallet]);

  const handleClick = useCallback(async () => {
    if (wallet) {
      // Already connected - check session and navigate
      const res = await fetch("/api/auth/session");
      if (res.ok) {
        window.location.href = href;
      } else {
        // Wallet connected but no session - re-auth
        pendingRedirect.current = href;
        const payloadRes = await fetch("/api/auth/ton-proof/payload");
        const { payload } = await payloadRes.json();
        tonConnectUI.setConnectRequestParameters({
          state: "ready",
          value: { tonProof: payload },
        });
        await tonConnectUI.disconnect();
        await tonConnectUI.openModal();
      }
      return;
    }

    // Not connected - trigger wallet connect, then redirect after auth
    pendingRedirect.current = href;
    const res = await fetch("/api/auth/ton-proof/payload");
    const { payload } = await res.json();
    tonConnectUI.setConnectRequestParameters({
      state: "ready",
      value: { tonProof: payload },
    });
    await tonConnectUI.openModal();
  }, [wallet, tonConnectUI, href]);

  return (
    <button onClick={handleClick} className={className}>
      {children}
    </button>
  );
}
