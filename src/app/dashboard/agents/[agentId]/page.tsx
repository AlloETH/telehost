"use client";

import { useEffect, useState, use, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
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
  Wallet,
  KeyRound,
  Clock,
  CalendarDays,
  Activity,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Settings,
  Brain,
  Shield,
  Key,
  Save,
  ExternalLink,
  Eye,
  EyeOff,
  Bot,
} from "lucide-react";

interface AgentConfig {
  provider?: string;
  apiKey?: string;
  model?: string;
  dmPolicy?: string;
  groupPolicy?: string;
  ownerName?: string;
  ownerUsername?: string;
  tavilyApiKey?: string;
  tonapiKey?: string;
}

interface Agent {
  id: string;
  name: string;
  status: string;
  telegramSessionStatus: string;
  coolifyDomain: string | null;
  coolifyStatus: string | null;
  healthStatus: string | null;
  webuiAuthToken: string | null;
  walletAddress: string | null;
  lastHealthCheck: string | null;
  lastError: string | null;
  restartCount: number;
  createdAt: string;
  updatedAt: string;
  config?: AgentConfig;
}

const TRANSITIONAL_STATES = ["provisioning", "starting", "deleting"];

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAgent = useCallback(() => {
    fetch(`/api/agents/${agentId}`)
      .then((r) => r.json())
      .then((data) => setAgent(data.agent))
      .finally(() => setLoading(false));
  }, [agentId]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  // Adaptive polling: faster during transitional states
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const interval = agent && TRANSITIONAL_STATES.includes(agent.status) ? 5000 : 10000;
    intervalRef.current = setInterval(fetchAgent, interval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [agent?.status, fetchAgent]);

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
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  const needsSession =
    agent.telegramSessionStatus !== "active" &&
    !["running", "deleting"].includes(agent.status);

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/dashboard/agents"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Agents
          </Link>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)] text-lg font-bold">
              {agent.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{agent.name}</h1>
              <p className="text-sm text-[var(--muted-foreground)]">
                Created {new Date(agent.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      {/* Alerts */}
      <div className="mt-6 space-y-3">
        {/* Deploying indicator */}
        {TRANSITIONAL_STATES.includes(agent.status) && (
          <div className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
            <Loader2 className="h-5 w-5 animate-spin text-blue-400 shrink-0" />
            <div>
              <p className="font-medium text-blue-400">
                {agent.status === "provisioning"
                  ? "Provisioning..."
                  : agent.status === "starting"
                    ? "Starting..."
                    : "Processing..."}
              </p>
              <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
                This may take a minute. Status updates automatically.
              </p>
            </div>
          </div>
        )}

        {/* Telegram Session Alert */}
        {needsSession && (
          <div className="flex items-start gap-3 rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
            <MessageSquareWarning className="h-5 w-5 text-purple-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-purple-400">
                Telegram session required
              </p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Complete the Telegram authentication to start your agent.
              </p>
              <Link
                href={`/dashboard/agents/${agentId}/session`}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
              >
                Setup Telegram Session
              </Link>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {agent.lastError && (
          <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-red-400">Error</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {agent.lastError}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-6 flex flex-wrap gap-2">
        {!["running", "starting", "deleting", "provisioning"].includes(agent.status) && (
          <button
            onClick={() => doAction("start")}
            disabled={!!actionLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {actionLoading === "start" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {actionLoading === "start" ? "Starting..." : "Start"}
          </button>
        )}
        {agent.status === "running" && (
          <>
            <button
              onClick={() => doAction("stop")}
              disabled={!!actionLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {actionLoading === "stop" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              {actionLoading === "stop" ? "Stopping..." : "Stop"}
            </button>
            <button
              onClick={() => doAction("restart")}
              disabled={!!actionLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent)] disabled:opacity-50 transition-colors"
            >
              {actionLoading === "restart" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              {actionLoading === "restart" ? "Restarting..." : "Restart"}
            </button>
          </>
        )}
        {!["deleting", "provisioning"].includes(agent.status) && (
          <button
            onClick={() => doAction("redeploy")}
            disabled={!!actionLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 px-4 py-2 text-sm text-blue-400 hover:bg-blue-500/10 disabled:opacity-50 transition-colors"
          >
            {actionLoading === "redeploy" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {actionLoading === "redeploy" ? "Redeploying..." : "Update & Redeploy"}
          </button>
        )}
        <Link
          href={`/dashboard/agents/${agentId}/logs`}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent)] transition-colors"
        >
          <ScrollText className="h-3.5 w-3.5" />
          View Logs
        </Link>
        <button
          onClick={doDelete}
          disabled={!!actionLoading}
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
        >
          {actionLoading === "delete" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          {actionLoading === "delete" ? "Deleting..." : "Delete"}
        </button>
      </div>

      {/* Info Grid */}
      <div className="mt-8 grid grid-cols-2 gap-3">
        <InfoCard
          icon={<Activity className="h-4 w-4" />}
          label="Status"
          value={agent.status.replace(/_/g, " ")}
        />
        <HealthCard
          health={agent.healthStatus}
          coolifyStatus={agent.coolifyStatus}
        />
        <InfoCard
          icon={<Bot className="h-4 w-4" />}
          label="Telegram Session"
          value={agent.telegramSessionStatus}
        />
        <InfoCard
          icon={<RotateCcw className="h-4 w-4" />}
          label="Restart Count"
          value={String(agent.restartCount)}
        />
        <InfoCard
          icon={<Clock className="h-4 w-4" />}
          label="Last Health Check"
          value={
            agent.lastHealthCheck
              ? new Date(agent.lastHealthCheck).toLocaleString()
              : "Never"
          }
        />
        <InfoCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="Created"
          value={new Date(agent.createdAt).toLocaleString()}
        />
        <DomainCard domain={agent.coolifyDomain} />
        <WalletCard agentId={agentId} address={agent.walletAddress} onUpdate={fetchAgent} />
        {agent.webuiAuthToken && (
          <AuthTokenCard token={agent.webuiAuthToken} />
        )}
      </div>

      {/* Settings */}
      {agent.config && (
        <SettingsSection agentId={agentId} agent={agent} onUpdate={fetchAgent} />
      )}
    </div>
  );
}

function HealthCard({
  health,
  coolifyStatus,
}: {
  health: string | null;
  coolifyStatus: string | null;
}) {
  const healthConfig: Record<string, { color: string; label: string }> = {
    healthy: { color: "text-green-400", label: "Healthy" },
    unhealthy: { color: "text-red-400", label: "Unhealthy" },
    degraded: { color: "text-orange-400", label: "Degraded" },
  };

  const h = health ? healthConfig[health] : null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
        <Activity className="h-3.5 w-3.5" />
        <p className="text-xs">Container Health</p>
      </div>
      <div className="mt-1.5">
        {h ? (
          <p className={`text-sm font-medium ${h.color}`}>{h.label}</p>
        ) : (
          <p className="text-sm font-medium text-[var(--muted-foreground)]">
            {coolifyStatus || "Unknown"}
          </p>
        )}
      </div>
    </div>
  );
}

function DomainCard({ domain }: { domain: string | null }) {
  if (!domain) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
          <Globe className="h-3.5 w-3.5" />
          <p className="text-xs">Domain</p>
        </div>
        <p className="mt-1.5 text-sm font-medium text-[var(--muted-foreground)]">Not assigned</p>
      </div>
    );
  }

  const url = domain.startsWith("http") ? domain : `https://${domain}`;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
        <Globe className="h-3.5 w-3.5" />
        <p className="text-xs">Domain</p>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--primary)] hover:underline truncate"
      >
        {domain}
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    </div>
  );
}

function WalletCard({
  agentId,
  address,
  onUpdate,
}: {
  agentId: string;
  address: string | null;
  onUpdate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [mnemonic, setMnemonic] = useState<string[] | null>(null);
  const [mnemonicCopied, setMnemonicCopied] = useState(false);

  const generateWallet = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/wallet`, { method: "POST" });
      const data = await res.json();
      if (data.mnemonic) {
        setMnemonic(data.mnemonic);
        onUpdate();
      }
    } finally {
      setGenerating(false);
    }
  };

  if (mnemonic) {
    return (
      <div className="col-span-2 rounded-xl border border-green-500/30 bg-green-500/5 p-5">
        <div className="flex items-center gap-2 text-green-400">
          <Wallet className="h-4 w-4" />
          <p className="font-medium">Wallet Created</p>
        </div>
        <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
          Back up your mnemonic phrase. It will not be shown again in full.
        </p>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {mnemonic.map((word, i) => (
            <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-center text-sm font-mono">
              <span className="text-[var(--muted-foreground)]">{i + 1}.</span> {word}
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(mnemonic.join(" "));
              setMnemonicCopied(true);
              setTimeout(() => setMnemonicCopied(false), 2000);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent)] transition-colors"
          >
            {mnemonicCopied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
            {mnemonicCopied ? "Copied!" : "Copy Mnemonic"}
          </button>
          <button
            onClick={() => setMnemonic(null)}
            className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
          <Wallet className="h-3.5 w-3.5" />
          <p className="text-xs">TON Wallet</p>
        </div>
        <button
          onClick={generateWallet}
          disabled={generating}
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
          {generating ? "Generating..." : "Generate Wallet"}
        </button>
      </div>
    );
  }

  const copyAddr = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const explorerUrl = `https://tonviewer.com/${address}`;
  const short = address.slice(0, 8) + "..." + address.slice(-6);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
        <Wallet className="h-3.5 w-3.5" />
        <p className="text-xs">TON Wallet</p>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono text-sm text-[var(--primary)] hover:underline"
        >
          {short}
          <ExternalLink className="h-3 w-3" />
        </a>
        <button
          onClick={copyAddr}
          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <MnemonicRevealButton agentId={agentId} />
      </div>
    </div>
  );
}

function MnemonicRevealButton({ agentId }: { agentId: string }) {
  const [mnemonic, setMnemonic] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const reveal = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/wallet/mnemonic`);
      const data = await res.json();
      if (data.mnemonic) setMnemonic(data.mnemonic);
    } finally {
      setLoading(false);
    }
  };

  if (mnemonic) {
    return (
      <>
        <button
          onClick={() => {
            navigator.clipboard.writeText(mnemonic.join(" "));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="inline-flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied!" : "Copy Mnemonic"}
        </button>
        <button
          onClick={() => setMnemonic(null)}
          className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <EyeOff className="h-3 w-3" />
          Hide
        </button>
      </>
    );
  }

  return (
    <button
      onClick={reveal}
      disabled={loading}
      className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Key className="h-3 w-3" />}
      {loading ? "..." : "Backup"}
    </button>
  );
}

function AuthTokenCard({ token }: { token: string }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
        <KeyRound className="h-3.5 w-3.5" />
        <p className="text-xs">WebUI Auth Token</p>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="flex-1 truncate font-mono text-sm">
          {visible ? token : "••••••••••••••••"}
        </code>
        <button
          onClick={() => setVisible(!visible)}
          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={copy}
          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

function SettingsSection({
  agentId,
  agent,
  onUpdate,
}: {
  agentId: string;
  agent: Agent;
  onUpdate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const config = agent.config || {};
  const [name, setName] = useState(agent.name);
  const [provider, setProvider] = useState(config.provider || "");
  const [apiKey, setApiKey] = useState(config.apiKey || "");
  const [model, setModel] = useState(config.model || "");
  const [dmPolicy, setDmPolicy] = useState(config.dmPolicy || "pairing");
  const [groupPolicy, setGroupPolicy] = useState(config.groupPolicy || "open");
  const [ownerName, setOwnerName] = useState(config.ownerName || "");
  const [ownerUsername, setOwnerUsername] = useState(config.ownerUsername || "");
  const [tavilyApiKey, setTavilyApiKey] = useState(config.tavilyApiKey || "");
  const [tonapiKey, setTonapiKey] = useState(config.tonapiKey || "");

  const save = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const body: Record<string, string> = {};

      // Only send changed fields
      if (name !== agent.name) body.name = name;
      if (provider !== (config.provider || "")) body.provider = provider;
      if (apiKey !== (config.apiKey || "")) body.apiKey = apiKey;
      if (model !== (config.model || "")) body.model = model;
      if (dmPolicy !== (config.dmPolicy || "pairing")) body.dmPolicy = dmPolicy;
      if (groupPolicy !== (config.groupPolicy || "open")) body.groupPolicy = groupPolicy;
      if (ownerName !== (config.ownerName || "")) body.ownerName = ownerName;
      if (ownerUsername !== (config.ownerUsername || "")) body.ownerUsername = ownerUsername;
      if (tavilyApiKey !== (config.tavilyApiKey || "")) body.tavilyApiKey = tavilyApiKey;
      if (tonapiKey !== (config.tonapiKey || "")) body.tonapiKey = tonapiKey;

      if (Object.keys(body).length === 0) {
        setFeedback({ type: "error", msg: "No changes to save" });
        return;
      }

      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setFeedback({ type: "error", msg: data.error || "Failed to save" });
        return;
      }

      setFeedback({
        type: "success",
        msg: data.redeployed ? "Saved. Redeploying agent..." : "Saved",
      });
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-8">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-left hover:border-[var(--muted-foreground)]/30 transition-colors"
      >
        <span className="inline-flex items-center gap-2 font-medium">
          <Settings className="h-4 w-4 text-[var(--muted-foreground)]" />
          Settings
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-[var(--muted-foreground)]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[var(--muted-foreground)]" />
        )}
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 space-y-5">
          {/* Name */}
          <SettingsField label="Agent Name" value={name} onChange={setName} />

          {/* LLM Settings */}
          <div className="border-t border-[var(--border)] pt-5">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="h-4 w-4 text-[var(--muted-foreground)]" />
              <p className="text-sm font-medium">LLM Configuration</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <SettingsSelect
                label="Provider"
                value={provider}
                onChange={setProvider}
                options={["anthropic", "openai", "google", "groq", "openrouter"]}
              />
              <SettingsField label="Model" value={model} onChange={setModel} placeholder="e.g. claude-sonnet-4-20250514" />
              <div className="col-span-2">
                <SettingsField label="API Key" value={apiKey} onChange={setApiKey} type="password" />
              </div>
            </div>
          </div>

          {/* Telegram Policies */}
          <div className="border-t border-[var(--border)] pt-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-4 w-4 text-[var(--muted-foreground)]" />
              <p className="text-sm font-medium">Telegram Policies</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <SettingsSelect
                label="DM Policy"
                value={dmPolicy}
                onChange={setDmPolicy}
                options={["open", "pairing", "admin_only"]}
              />
              <SettingsSelect
                label="Group Policy"
                value={groupPolicy}
                onChange={setGroupPolicy}
                options={["open", "admin_only"]}
              />
              <SettingsField label="Owner Name" value={ownerName} onChange={setOwnerName} placeholder="Display name" />
              <SettingsField label="Owner Username" value={ownerUsername} onChange={setOwnerUsername} placeholder="@username" />
            </div>
          </div>

          {/* Optional API Keys */}
          <div className="border-t border-[var(--border)] pt-5">
            <div className="flex items-center gap-2 mb-4">
              <Key className="h-4 w-4 text-[var(--muted-foreground)]" />
              <p className="text-sm font-medium">Optional API Keys</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <SettingsField label="Tavily API Key" value={tavilyApiKey} onChange={setTavilyApiKey} type="password" />
              <SettingsField label="TonAPI Key" value={tonapiKey} onChange={setTonapiKey} type="password" />
            </div>
          </div>

          {/* Feedback */}
          {feedback && (
            <div
              className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
                feedback.type === "success"
                  ? "bg-green-500/10 text-green-400 border border-green-500/30"
                  : "bg-red-500/10 text-red-400 border border-red-500/30"
              }`}
            >
              {feedback.type === "success" ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              {feedback.msg}
            </div>
          )}

          {/* Save */}
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}

function SettingsField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)] transition-shadow"
      />
    </div>
  );
}

function SettingsSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)] transition-shadow"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
        {icon}
        <p className="text-xs">{label}</p>
      </div>
      <p className="mt-1.5 text-sm font-medium capitalize">{value}</p>
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
    deleting: { bg: "bg-red-500/20 text-red-400", dot: "bg-red-400" },
  };

  const c = config[status] || { bg: "bg-gray-500/20 text-gray-400", dot: "bg-gray-400" };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${c.bg}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${c.dot} ${status === "running" ? "animate-pulse" : ""}`} />
      {status.replace(/_/g, " ")}
    </span>
  );
}
