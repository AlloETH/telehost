"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Bot, ChevronRight } from "lucide-react";

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
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {agents.length} agent{agents.length !== 1 ? "s" : ""} deployed
          </p>
        </div>
        <Link
          href="/dashboard/agents/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:brightness-110 transition-all"
        >
          <Plus className="h-4 w-4" /> Deploy Agent
        </Link>
      </div>

      {agents.length === 0 ? (
        <div className="mt-16 rounded-xl border border-dashed border-[var(--border)] p-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)]">
            <Bot className="h-7 w-7" />
          </div>
          <p className="mt-4 text-lg font-medium">No agents deployed yet</p>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Deploy your first AI agent to get started with Telegram + TON automation.
          </p>
          <Link
            href="/dashboard/agents/new"
            className="mt-6 inline-block rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-medium text-white hover:brightness-110 transition-all"
          >
            Deploy Your First Agent
          </Link>
          <p className="mt-3 text-xs text-[var(--muted-foreground)]">
            Free 1-hour trial for 1 agent - no payment required
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href={`/dashboard/agents/${agent.id}`}
              className="group flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 hover:border-[var(--muted-foreground)]/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-semibold group-hover:bg-[var(--primary)]/10 group-hover:text-[var(--primary)] transition-colors">
                  {agent.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-medium">{agent.name}</h3>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Created{" "}
                    {new Date(agent.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {agent.telegramSessionStatus !== "active" && (
                  <span className="rounded-full bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium text-[var(--warning)]">
                    Session needed
                  </span>
                )}
                <StatusBadge status={agent.status} />
                <ChevronRight className="h-4 w-4 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; dot: string }> = {
    running: { bg: "bg-green-500/20 text-green-400", dot: "bg-green-400" },
    stopped: { bg: "bg-gray-500/20 text-gray-400", dot: "bg-gray-400" },
    starting: { bg: "bg-blue-500/20 text-blue-400", dot: "bg-blue-400" },
    error: { bg: "bg-red-500/20 text-red-400", dot: "bg-red-400" },
    provisioning: { bg: "bg-yellow-500/20 text-yellow-400", dot: "bg-yellow-400" },
    awaiting_session: { bg: "bg-purple-500/20 text-purple-400", dot: "bg-purple-400" },
    suspended: { bg: "bg-orange-500/20 text-orange-400", dot: "bg-orange-400" },
  };

  const c = config[status] || { bg: "bg-gray-500/20 text-gray-400", dot: "bg-gray-400" };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.bg}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.dot} ${status === "running" ? "animate-pulse" : ""}`} />
      {status.replace(/_/g, " ")}
    </span>
  );
}
