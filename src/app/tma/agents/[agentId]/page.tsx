"use client";

import { useEffect, useState, use, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  Square,
  RotateCcw,
  RefreshCw,
  Trash2,
  ScrollText,
  Loader2,
  AlertTriangle,
  MessageSquareWarning,
  Globe,
  Bot,
  Timer,
  KeyRound,
  ExternalLink,
} from "lucide-react";
import { useTelegramBackButton, useTelegramHaptic } from "@/lib/hooks/use-telegram";

interface Agent {
  id: string;
  name: string;
  status: string;
  telegramSessionStatus: string;
  coolifyDomain: string | null;
  webuiAuthToken: string | null;
  walletAddress: string | null;
  lastError: string | null;
  restartCount: number;
  createdAt: string;
  trialEndsAt: string | null;
  config?: {
    provider?: string;
    model?: string;
    dmPolicy?: string;
    groupPolicy?: string;
  };
}

const TRANSITIONAL = ["provisioning", "starting", "deploying", "deleting", "stopping", "restarting"];

export default function TMAAgentDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const router = useRouter();
  const haptic = useTelegramHaptic();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useTelegramBackButton(() => router.push("/tma"));

  const fetchAgent = useCallback(() => {
    fetch(`/api/agents/${agentId}`)
      .then((r) => r.json())
      .then((data) => setAgent(data.agent))
      .finally(() => setLoading(false));
  }, [agentId]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const ms = agent && TRANSITIONAL.includes(agent.status) ? 5000 : 10000;
    intervalRef.current = setInterval(fetchAgent, ms);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [agent?.status, fetchAgent]);

  const doAction = async (action: string) => {
    haptic.impact("medium");
    setActionLoading(action);
    try {
      await fetch(`/api/agents/${agentId}/${action}`, { method: "POST" });
      setTimeout(fetchAgent, 1000);
    } finally {
      setActionLoading("");
    }
  };

  const doDelete = () => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    webApp.showConfirm("Delete this agent? This cannot be undone.", async (confirmed) => {
      if (!confirmed) return;
      haptic.notification("warning");
      setActionLoading("delete");
      try {
        await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
        router.push("/tma");
      } finally {
        setActionLoading("");
      }
    });
  };

  if (loading || !agent) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  const isBusy = !!actionLoading || TRANSITIONAL.includes(agent.status);
  const needsSession = agent.telegramSessionStatus !== "active" && !["running", "deleting"].includes(agent.status);

  return (
    <div className="px-4 pt-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent)] text-lg font-bold shrink-0">
          {agent.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{agent.name}</h1>
          <StatusBadge status={agent.status} />
        </div>
      </div>

      {/* Alerts */}
      <div className="space-y-2 mb-4">
        {TRANSITIONAL.includes(agent.status) && (
          <div className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
            <Loader2 className="h-4 w-4 animate-spin text-blue-400 shrink-0" />
            <p className="text-sm text-blue-400">
              {agent.status === "provisioning" ? "Provisioning..." :
               agent.status === "deploying" ? "Deploying..." :
               agent.status === "starting" ? "Starting..." :
               agent.status === "stopping" ? "Stopping..." :
               agent.status === "restarting" ? "Restarting..." : "Processing..."}
            </p>
          </div>
        )}

        {agent.trialEndsAt && <TrialBanner trialEndsAt={agent.trialEndsAt} status={agent.status} />}

        {needsSession && (
          <button
            onClick={() => {
              haptic.impact("light");
              router.push(`/tma/agents/${agentId}/session`);
            }}
            className="w-full flex items-center gap-3 rounded-xl border border-purple-500/30 bg-purple-500/5 p-3 text-left"
          >
            <MessageSquareWarning className="h-5 w-5 text-purple-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-purple-400">Telegram session required</p>
              <p className="text-xs text-[var(--muted-foreground)]">Tap to authenticate</p>
            </div>
          </button>
        )}

        {agent.lastError && (
          <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
            <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-400">{agent.lastError}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2 mb-4">
        {!["running", "starting", "deploying", "deleting", "provisioning", "stopping", "restarting"].includes(agent.status) && (
          <ActionButton
            onClick={() => doAction("start")}
            disabled={isBusy}
            loading={actionLoading === "start"}
            icon={<Play className="h-4 w-4" />}
            label="Start"
            loadingLabel="Starting..."
            className="bg-green-600 text-white"
          />
        )}
        {["running", "stopping", "restarting"].includes(agent.status) && (
          <>
            <ActionButton
              onClick={() => doAction("stop")}
              disabled={isBusy}
              loading={actionLoading === "stop" || agent.status === "stopping"}
              icon={<Square className="h-4 w-4" />}
              label="Stop"
              loadingLabel="Stopping..."
              className="bg-yellow-600 text-white"
            />
            <ActionButton
              onClick={() => doAction("restart")}
              disabled={isBusy}
              loading={actionLoading === "restart" || agent.status === "restarting"}
              icon={<RotateCcw className="h-4 w-4" />}
              label="Restart"
              loadingLabel="Restarting..."
              className="border border-[var(--border)]"
            />
          </>
        )}
        {!["deleting", "provisioning"].includes(agent.status) && (
          <ActionButton
            onClick={() => doAction("redeploy")}
            disabled={isBusy}
            loading={actionLoading === "redeploy" || agent.status === "deploying"}
            icon={<RefreshCw className="h-4 w-4" />}
            label="Update & Redeploy"
            loadingLabel="Redeploying..."
            className="border border-blue-500/30 text-blue-400"
          />
        )}
        <ActionButton
          onClick={() => {
            haptic.selection();
            router.push(`/tma/agents/${agentId}/logs`);
          }}
          icon={<ScrollText className="h-4 w-4" />}
          label="View Logs"
          className="border border-[var(--border)]"
        />
      </div>

      {/* Info cards */}
      <div className="space-y-2 mb-4">
        {agent.coolifyDomain && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-[var(--muted-foreground)]" />
              <span className="text-xs text-[var(--muted-foreground)]">Domain</span>
            </div>
            <a
              href={agent.coolifyDomain.startsWith("http") ? agent.coolifyDomain : `https://${agent.coolifyDomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-sm text-[var(--primary)]"
            >
              {agent.coolifyDomain}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
        {agent.config && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="h-4 w-4 text-[var(--muted-foreground)]" />
              <span className="text-xs text-[var(--muted-foreground)]">Configuration</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-[var(--muted-foreground)]">Provider</span>
              <span className="capitalize">{agent.config.provider || "-"}</span>
              <span className="text-[var(--muted-foreground)]">Model</span>
              <span className="truncate">{agent.config.model || "-"}</span>
              <span className="text-[var(--muted-foreground)]">DM Policy</span>
              <span>{agent.config.dmPolicy || "-"}</span>
              <span className="text-[var(--muted-foreground)]">Group Policy</span>
              <span>{agent.config.groupPolicy || "-"}</span>
            </div>
          </div>
        )}
        {agent.webuiAuthToken && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[var(--muted-foreground)]" />
              <span className="text-xs text-[var(--muted-foreground)]">WebUI Auth Token</span>
            </div>
            <code className="mt-1 block text-sm font-mono truncate">{agent.webuiAuthToken}</code>
          </div>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={doDelete}
        disabled={isBusy}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-500/30 p-3 text-sm text-red-400 disabled:opacity-50"
      >
        {actionLoading === "delete" || agent.status === "deleting" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        {actionLoading === "delete" || agent.status === "deleting" ? "Deleting..." : "Delete Agent"}
      </button>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  loading,
  icon,
  label,
  loadingLabel,
  className = "",
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon: React.ReactNode;
  label: string;
  loadingLabel?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-center gap-2 rounded-xl p-3 text-sm font-medium disabled:opacity-50 active:scale-[0.98] transition-transform ${className}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {loading ? loadingLabel : label}
    </button>
  );
}

function TrialBanner({ trialEndsAt, status }: { trialEndsAt: string; status: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = new Date(trialEndsAt).getTime() - now;
  const expired = remaining <= 0;

  if (expired && status === "suspended") {
    return (
      <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-3">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-orange-400" />
          <p className="text-sm font-medium text-orange-400">Trial expired</p>
        </div>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">Subscribe to restart your agent</p>
      </div>
    );
  }

  if (expired) return null;

  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
      <Timer className="h-4 w-4 text-amber-400 shrink-0" />
      <p className="text-sm text-amber-400">
        Trial - {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`} left
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: "bg-green-500/20 text-green-400",
    stopped: "bg-gray-500/20 text-gray-400",
    starting: "bg-blue-500/20 text-blue-400",
    deploying: "bg-cyan-500/20 text-cyan-400",
    error: "bg-red-500/20 text-red-400",
    provisioning: "bg-yellow-500/20 text-yellow-400",
    awaiting_session: "bg-purple-500/20 text-purple-400",
    suspended: "bg-orange-500/20 text-orange-400",
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || "bg-gray-500/20 text-gray-400"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
