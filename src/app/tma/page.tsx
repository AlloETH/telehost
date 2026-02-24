"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Wallet, ChevronRight } from "lucide-react";
import { useTMA } from "./tma-provider";
import { useTelegramHaptic } from "@/lib/hooks/use-telegram";

interface Agent {
  id: string;
  name: string;
  status: string;
  telegramSessionStatus: string;
  createdAt: string;
}

interface BillingStatus {
  tier: string;
  status: string;
}

export default function TMAAgentsPage() {
  const { walletAddress } = useTMA();
  const router = useRouter();
  const haptic = useTelegramHaptic();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/agents").then((r) => r.json()),
      fetch("/api/billing/status").then((r) => r.json()).catch(() => null),
    ])
      .then(([agentsData, billingData]) => {
        setAgents(agentsData.agents || []);
        if (billingData) setBilling(billingData);
      })
      .finally(() => setLoading(false));
  }, []);

  const needsWallet = walletAddress?.startsWith("tma_");
  const runningCount = agents.filter((a) => a.status === "running").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-center">
          <p className="text-xl font-bold">{agents.length}</p>
          <p className="text-xs text-[var(--muted-foreground)]">Total</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-center">
          <p className="text-xl font-bold text-green-400">{runningCount}</p>
          <p className="text-xs text-[var(--muted-foreground)]">Running</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-center">
          <p className="text-xl font-bold capitalize">{billing?.tier || "Free"}</p>
          <p className="text-xs text-[var(--muted-foreground)]">Plan</p>
        </div>
      </div>

      {/* Wallet prompt */}
      {needsWallet && (
        <button
          onClick={() => {
            haptic.impact("light");
            router.push("/tma/billing");
          }}
          className="mb-4 w-full flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"
        >
          <Wallet className="h-5 w-5 text-amber-400 shrink-0" />
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-amber-400">Connect wallet</p>
            <p className="text-xs text-[var(--muted-foreground)]">Link your TON wallet for payments</p>
          </div>
          <ChevronRight className="h-4 w-4 text-[var(--muted-foreground)]" />
        </button>
      )}

      {/* Agent list */}
      {agents.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-[var(--border)] p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)]">
            <Bot className="h-6 w-6" />
          </div>
          <p className="mt-4 font-medium">No agents yet</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Deploy your first AI agent
          </p>
          <button
            onClick={() => {
              haptic.impact("medium");
              router.push("/tma/deploy");
            }}
            className="mt-4 rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-medium text-white"
          >
            Deploy Agent
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => {
                haptic.selection();
                router.push(`/tma/agents/${agent.id}`);
              }}
              className="w-full flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-left active:scale-[0.98] transition-transform"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-semibold shrink-0">
                {agent.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate">{agent.name}</h3>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {new Date(agent.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {agent.telegramSessionStatus !== "active" && (
                  <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-[var(--warning)]">
                    Session
                  </span>
                )}
                <StatusDot status={agent.status} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: "bg-green-400",
    stopped: "bg-gray-400",
    starting: "bg-blue-400",
    deploying: "bg-cyan-400",
    error: "bg-red-400",
    provisioning: "bg-yellow-400",
    awaiting_session: "bg-purple-400",
    suspended: "bg-orange-400",
  };

  return (
    <span
      className={`h-2.5 w-2.5 rounded-full ${colors[status] || "bg-gray-400"} ${
        ["running", "starting", "deploying"].includes(status) ? "animate-pulse" : ""
      }`}
    />
  );
}
