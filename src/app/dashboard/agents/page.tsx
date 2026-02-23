"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Agent {
  id: string;
  name: string;
  status: string;
  telegramSessionStatus: string;
  createdAt: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => setAgents(data.agents || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Agents</h1>
        <Link
          href="/dashboard/agents/new"
          className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          Deploy New Agent
        </Link>
      </div>

      {agents.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-[var(--muted-foreground)]">
            No agents deployed yet.
          </p>
          <Link
            href="/dashboard/agents/new"
            className="mt-4 inline-block rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            Deploy Your First Agent
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href={`/dashboard/agents/${agent.id}`}
              className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 hover:bg-[var(--accent)] transition-colors"
            >
              <div>
                <h3 className="font-semibold">{agent.name}</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Created{" "}
                  {new Date(agent.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {agent.telegramSessionStatus !== "active" && (
                  <span className="text-xs text-[var(--warning)]">
                    Session needed
                  </span>
                )}
                <StatusBadge status={agent.status} />
              </div>
            </Link>
          ))}
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
