"use client";

import { useEffect, useState } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { Wallet, Check } from "lucide-react";
import { SUBSCRIPTION_TIERS } from "@/lib/constants";
import { useTMA } from "../tma-provider";
import { useTelegramBackButton, useTelegramHaptic } from "@/lib/hooks/use-telegram";
import { useRouter } from "next/navigation";

interface Subscription {
  tier: string;
  status: string;
  currentPeriodEnd: string;
  maxAgents: number;
  memoryLimitMb: number;
}

interface Payment {
  id: string;
  amountNanoton: string;
  tier: string;
  status: string;
  createdAt: string;
}

export default function TMABillingPage() {
  const router = useRouter();
  const { walletAddress } = useTMA();
  const haptic = useTelegramHaptic();
  const [tonConnectUI] = useTonConnectUI();
  const tonAddress = useTonAddress();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState("");

  useTelegramBackButton(() => router.push("/tma"));

  const needsWallet = walletAddress?.startsWith("tma_");

  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((data) => {
        setSubscription(data.subscription);
        setPayments(data.payments || []);
      })
      .finally(() => setLoading(false));
  }, []);

  // Link wallet after TonConnect
  useEffect(() => {
    if (!tonAddress || !needsWallet) return;

    // Auto-link wallet via TON proof when connected
    // This is handled by the TonConnect button flow
  }, [tonAddress, needsWallet]);

  const handleSubscribe = async (tier: string) => {
    if (!tonAddress) {
      haptic.notification("warning");
      return;
    }

    haptic.impact("medium");
    setPaying(tier);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, senderAddress: tonAddress }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      const { paymentId, transaction } = await res.json();

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          {
            address: transaction.address,
            amount: transaction.amount,
            payload: transaction.payload,
          },
        ],
      });

      const verifyRes = await fetch("/api/billing/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });

      if (verifyRes.ok) {
        haptic.notification("success");
        const statusRes = await fetch("/api/billing/status");
        const statusData = await statusRes.json();
        setSubscription(statusData.subscription);
        setPayments(statusData.payments || []);
      }
    } catch (err) {
      console.error("Payment failed:", err);
      haptic.notification("error");
    } finally {
      setPaying("");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-4">
      <h1 className="text-xl font-bold mb-4">Billing</h1>

      {/* Wallet connection */}
      {needsWallet && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-5 w-5 text-amber-400" />
            <p className="font-medium text-amber-400">Connect wallet</p>
          </div>
          <p className="text-xs text-[var(--muted-foreground)] mb-3">
            Link your TON wallet to subscribe and make payments.
          </p>
          <button
            onClick={() => tonConnectUI.openModal()}
            className="w-full rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white active:opacity-80 transition-opacity"
          >
            Connect TON Wallet
          </button>
        </div>
      )}

      {/* Current plan */}
      {subscription && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs text-[var(--muted-foreground)]">Current Plan</p>
              <p className="text-xl font-bold capitalize">{subscription.tier}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              subscription.status === "active" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
            }`}>
              {subscription.status.replace("_", " ")}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-[var(--muted-foreground)]">Expires</p>
              <p>{new Date(subscription.currentPeriodEnd).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-[var(--muted-foreground)]">Agents</p>
              <p>{subscription.maxAgents}</p>
            </div>
            <div>
              <p className="text-[var(--muted-foreground)]">RAM</p>
              <p>{subscription.memoryLimitMb} MB</p>
            </div>
          </div>
        </div>
      )}

      {/* Plans */}
      <h2 className="text-sm font-semibold mb-2">
        {subscription ? "Renew or Upgrade" : "Choose a Plan"}
      </h2>

      <div className="space-y-3 mb-4">
        {(["basic", "pro", "enterprise"] as const).map((key) => {
          const tier = SUBSCRIPTION_TIERS[key];
          const isCurrent = subscription?.tier === key;

          return (
            <div
              key={key}
              className={`rounded-xl border p-4 ${
                key === "pro" ? "border-[var(--primary)]" : "border-[var(--border)]"
              } bg-[var(--card)]`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">{tier.name}</h3>
                <span className="text-xl font-bold">
                  {tier.priceTon} <span className="text-sm font-normal text-[var(--muted-foreground)]">TON/mo</span>
                </span>
              </div>
              <div className="flex gap-4 text-xs text-[var(--muted-foreground)] mb-3">
                <span>{tier.maxAgents} agent{tier.maxAgents > 1 ? "s" : ""}</span>
                <span>{tier.memoryLimitMb} MB</span>
                <span>{tier.cpuLimit} CPU</span>
              </div>
              <button
                onClick={() => handleSubscribe(key)}
                disabled={!!paying || !tonAddress}
                className="w-full rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 active:opacity-80 transition-opacity"
              >
                {paying === key ? "Sending..." :
                 isCurrent && subscription?.status === "active" ? "Renew" :
                 `Subscribe`}
              </button>
            </div>
          );
        })}
      </div>

      {/* Payment history */}
      {payments.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">Payment History</h2>
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                <div>
                  <p className="text-sm capitalize">{p.tier}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm">{(Number(p.amountNanoton) / 1e9).toFixed(2)} TON</p>
                  <span className={`text-xs ${
                    p.status === "confirmed" ? "text-green-400" : p.status === "pending" ? "text-yellow-400" : "text-red-400"
                  }`}>
                    {p.status === "confirmed" && <Check className="h-3 w-3 inline mr-0.5" />}
                    {p.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
