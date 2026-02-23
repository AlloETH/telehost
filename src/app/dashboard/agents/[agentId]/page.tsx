"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

interface Agent {
  id: string;
  name: string;
  status: string;
  telegramSessionStatus: string;
  coolifyDomain: string | null;
  lastHealthCheck: string | null;
  lastError: string | null;
  restartCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  const fetchAgent = () => {
    fetch(`/api/agents/${agentId}`)
      .then((r) => r.json())
      .then((data) => setAgent(data.agent))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAgent();
    const interval = setInterval(fetchAgent, 10000);
    return () => clearInterval(interval);
  }, [agentId]);

  const doAction = async (action: string) => {
    setActionLoading(action);
    try {
      await fetch(`/api/agents/${agentId}/${action}`, { method: "POST" });
      setTimeout(fetchAgent, 1000);
    } finally {
      setActionLoading("");
    }
  };

  const doDelete = async () => {
    if (!confirm("Are you sure you want to delete this agent?")) return;
    setActionLoading("delete");
    try {
      await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
      window.location.href = "/dashboard/agents";
    } finally {
      setActionLoading("");
    }
  };

  if (loading || !agent) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/agents"
            className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            &larr; Back to Agents
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{agent.name}</h1>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      {/* Telegram Session Alert */}
      {agent.status === "awaiting_session" && (
        <div className="mt-6 rounded-xl border border-purple-500/30 bg-purple-500/10 p-4">
          <p className="font-medium text-purple-400">
            Telegram session required
          </p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Complete the Telegram authentication to start your agent.
          </p>
          <Link
            href={`/dashboard/agents/${agentId}/session`}
            className="mt-3 inline-block rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            Setup Telegram Session
          </Link>
        </div>
      )}

      {/* Error Alert */}
      {agent.lastError && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="font-medium text-red-400">Error</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {agent.lastError}
          </p>
        </div>
      )}

      {/* Controls */}
      <div className="mt-6 flex gap-3">
        {(agent.status === "stopped" || agent.status === "error") && (
          <button
            onClick={() => doAction("start")}
            disabled={!!actionLoading}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {actionLoading === "start" ? "Starting..." : "Start"}
          </button>
        )}
        {agent.status === "running" && (
          <>
            <button
              onClick={() => doAction("stop")}
              disabled={!!actionLoading}
              className="rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {actionLoading === "stop" ? "Stopping..." : "Stop"}
            </button>
            <button
              onClick={() => doAction("restart")}
              disabled={!!actionLoading}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent)] disabled:opacity-50 transition-colors"
            >
              {actionLoading === "restart" ? "Restarting..." : "Restart"}
            </button>
          </>
        )}
        <Link
          href={`/dashboard/agents/${agentId}/logs`}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent)] transition-colors"
        >
          View Logs
        </Link>
        <button
          onClick={doDelete}
          disabled={!!actionLoading}
          className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
        >
          {actionLoading === "delete" ? "Deleting..." : "Delete"}
        </button>
      </div>

      {/* Info Grid */}
      <div className="mt-8 grid grid-cols-2 gap-4">
        <InfoCard
          label="Status"
          value={agent.status.replace("_", " ")}
        />
        <InfoCard
          label="Telegram Session"
          value={agent.telegramSessionStatus}
        />
        <InfoCard
          label="Restart Count"
          value={String(agent.restartCount)}
        />
        <InfoCard
          label="Last Health Check"
          value={
            agent.lastHealthCheck
              ? new Date(agent.lastHealthCheck).toLocaleString()
              : "Never"
          }
        />
        <InfoCard
          label="Created"
          value={new Date(agent.createdAt).toLocaleString()}
        />
        <InfoCard
          label="Domain"
          value={agent.coolifyDomain || "Not assigned"}
        />
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-1 font-medium capitalize">{value}</p>
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
      className={`rounded-full px-3 py-1 text-sm font-medium ${
        colors[status] || "bg-gray-500/20 text-gray-400"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
