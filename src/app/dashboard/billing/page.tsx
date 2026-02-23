"use client";

import { useEffect, useState } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { SUBSCRIPTION_TIERS } from "@/lib/constants";

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
  memo: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export default function BillingPage() {
  const [tonConnectUI] = useTonConnectUI();
  const address = useTonAddress();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState("");

  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((data) => {
        setSubscription(data.subscription);
        setPaymentHistory(data.payments || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSubscribe = async (tier: string) => {
    if (!address) {
      alert("Please connect your wallet first");
      return;
    }

    setPaying(tier);
    try {
      // 1. Create pending payment with memo
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, senderAddress: address }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      const { paymentId, transaction } = await res.json();

      // 2. Send TON via wallet (memo is baked into the payload)
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

      // 3. Confirm payment after wallet approves
      const verifyRes = await fetch("/api/billing/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });

      if (verifyRes.ok) {
        // Refresh billing status
        const statusRes = await fetch("/api/billing/status");
        const statusData = await statusRes.json();
        setSubscription(statusData.subscription);
        setPaymentHistory(statusData.payments || []);
      }
    } catch (err) {
      console.error("Payment failed:", err);
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
    <div>
      <h1 className="text-2xl font-bold">Billing</h1>

      {/* Current Plan */}
      {subscription && (
        <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--muted-foreground)]">
                Current Plan
              </p>
              <p className="text-2xl font-bold capitalize">
                {subscription.tier}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                subscription.status === "active"
                  ? "bg-green-500/20 text-green-400"
                  : subscription.status === "past_due"
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-red-500/20 text-red-400"
              }`}
            >
              {subscription.status.replace("_", " ")}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-[var(--muted-foreground)]">Expires</p>
              <p>
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-[var(--muted-foreground)]">Max Agents</p>
              <p>{subscription.maxAgents}</p>
            </div>
            <div>
              <p className="text-[var(--muted-foreground)]">RAM / Agent</p>
              <p>{subscription.memoryLimitMb} MB</p>
            </div>
          </div>
        </div>
      )}

      {/* Plans */}
      <h2 className="mt-10 text-lg font-semibold">
        {subscription ? "Renew or Upgrade" : "Choose a Plan"}
      </h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Send TON to subscribe for 30 days. When your plan expires, send again to
        renew.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {(["basic", "pro", "enterprise"] as const).map((key) => {
          const tier = SUBSCRIPTION_TIERS[key];
          const isCurrent = subscription?.tier === key;

          return (
            <div
              key={key}
              className={`rounded-xl border p-6 ${
                key === "pro"
                  ? "border-[var(--primary)]"
                  : "border-[var(--border)]"
              } bg-[var(--card)]`}
            >
              <h3 className="text-lg font-semibold">{tier.name}</h3>
              <p className="mt-2 text-3xl font-bold">
                {tier.priceTon} TON
                <span className="text-sm font-normal text-[var(--muted-foreground)]">
                  /mo
                </span>
              </p>
              <ul className="mt-4 space-y-1 text-sm text-[var(--muted-foreground)]">
                <li>
                  {tier.maxAgents} agent{tier.maxAgents > 1 ? "s" : ""}
                </li>
                <li>{tier.memoryLimitMb} MB RAM</li>
                <li>{tier.cpuLimit} CPU</li>
              </ul>
              <button
                onClick={() => handleSubscribe(key)}
                disabled={!!paying}
                className={`mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity ${
                  isCurrent && subscription?.status === "active"
                    ? "bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50"
                    : "bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50"
                }`}
              >
                {paying === key
                  ? "Sending..."
                  : isCurrent && subscription?.status === "active"
                    ? `Renew for ${tier.priceTon} TON`
                    : `Subscribe for ${tier.priceTon} TON`}
              </button>
            </div>
          );
        })}
      </div>

      {/* Payment History */}
      {paymentHistory.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 text-lg font-semibold">Payment History</h2>
          <div className="rounded-xl border border-[var(--border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--card)]">
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                    Tier
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-4 py-3">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 capitalize">{p.tier}</td>
                    <td className="px-4 py-3">
                      {(Number(p.amountNanoton) / 1e9).toFixed(2)} TON
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          p.status === "confirmed"
                            ? "bg-green-500/20 text-green-400"
                            : p.status === "pending"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
