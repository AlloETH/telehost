"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <p className="text-sm text-[var(--muted-foreground)]">
            Total Agents
          </p>
          <p className="mt-1 text-3xl font-bold">{data.agents.length}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <p className="text-sm text-[var(--muted-foreground)]">Running</p>
          <p className="mt-1 text-3xl font-bold text-[var(--success)]">
            {runningAgents}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <p className="text-sm text-[var(--muted-foreground)]">
            Subscription
          </p>
          <p className="mt-1 text-xl font-bold capitalize">
            {data.subscription?.tier || "None"}
            {data.subscription && (
              <span
                className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs ${
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
          className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          Deploy New Agent
        </Link>
        <Link
          href="/dashboard/billing"
          className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm hover:bg-[var(--accent)] transition-colors"
        >
          Manage Subscription
        </Link>
      </div>

      {/* Agent List */}
      {data.agents.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold">Your Agents</h2>
          <div className="space-y-2">
            {data.agents.map((agent) => (
              <Link
                key={agent.id}
                href={`/dashboard/agents/${agent.id}`}
                className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 hover:bg-[var(--accent)] transition-colors"
              >
                <span className="font-medium">{agent.name}</span>
                <StatusBadge status={agent.status} />
              </Link>
            ))}
          </div>
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
      {status.replace("_", " ")}
    </span>
  );
}
