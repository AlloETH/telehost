"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Zap, CreditCard, Plus, Rocket, ChevronRight } from "lucide-react";

interface DashboardData {
  agents: { id: string; name: string; status: string }[];
  subscription: {
    tier: string;
    status: string;
    currentPeriodEnd: string;
  } | null;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/agents").then((r) => r.json()),
      fetch("/api/billing/status").then((r) => r.json()),
    ]).then(([agentsRes, billingRes]) => {
      setData({
        agents: agentsRes.agents || [],
        subscription: billingRes.subscription,
      });
    });
  }, []);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  const runningAgents = data.agents.filter(
    (a) => a.status === "running",
  ).length;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Overview of your agents and subscription
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="group rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition-colors hover:border-[var(--muted-foreground)]/30">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Total Agents</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--muted-foreground)]">
              <Bot className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold">{data.agents.length}</p>
        </div>
        <div className="group rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition-colors hover:border-[var(--success)]/30">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Running</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10 text-[var(--success)]">
              <Zap className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-[var(--success)]">
            {runningAgents}
          </p>
        </div>
        <div className="group rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition-colors hover:border-[var(--primary)]/30">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">Subscription</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
              <CreditCard className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-xl font-bold capitalize">
            {data.subscription?.tier || "None"}
            {data.subscription && (
              <span
                className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  data.subscription.status === "active"
                    ? "bg-green-500/20 text-green-400"
                    : "bg-yellow-500/20 text-yellow-400"
                }`}
              >
                {data.subscription.status}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8 flex gap-3">
        <Link
          href="/dashboard/agents/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:brightness-110 transition-all"
        >
          <Rocket className="h-4 w-4" />
          Deploy New Agent
        </Link>
        <Link
          href="/dashboard/billing"
          className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] transition-colors"
        >
          Manage Subscription
        </Link>
      </div>

      {/* Agent List */}
      {data.agents.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Your Agents</h2>
            <Link
              href="/dashboard/agents"
              className="text-sm text-[var(--primary)] hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {data.agents.map((agent) => (
              <Link
                key={agent.id}
                href={`/dashboard/agents/${agent.id}`}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 hover:border-[var(--muted-foreground)]/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-semibold">
                    {agent.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium">{agent.name}</span>
                </div>
                <StatusBadge status={agent.status} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {data.agents.length === 0 && (
        <div className="mt-12 rounded-xl border border-dashed border-[var(--border)] p-12 text-center">
          <p className="text-lg font-medium">No agents yet</p>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Deploy your first AI agent to get started
          </p>
          <Link
            href="/dashboard/agents/new"
            className="mt-6 inline-block rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-medium text-white hover:brightness-110 transition-all"
          >
            Deploy Your First Agent
          </Link>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: "bg-green-500/20 text-green-400",
    stopped: "bg-gray-500/20 text-gray-400",
    starting: "bg-blue-500/20 text-blue-400",
    error: "bg-red-500/20 text-red-400",
    provisioning: "bg-yellow-500/20 text-yellow-400",
    awaiting_session: "bg-purple-500/20 text-purple-400",
    suspended: "bg-orange-500/20 text-orange-400",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        colors[status] || "bg-gray-500/20 text-gray-400"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
