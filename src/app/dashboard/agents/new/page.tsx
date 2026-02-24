"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Clock, CircleCheck, ExternalLink } from "lucide-react";

interface ProviderModel {
  value: string;
  label: string;
}

interface LLMProvider {
  value: string;
  label: string;
  apiKeyUrl: string;
  apiKeyLabel: string;
  apiKeyHelp: string;
  extraHelp?: string;
  placeholder: string;
  models: ProviderModel[];
  defaultModel: string;
}

const LLM_PROVIDERS: LLMProvider[] = [
  {
    value: "anthropic",
    label: "Anthropic (Claude)",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    apiKeyLabel: "Anthropic Console",
    apiKeyHelp: "Go to Settings > API Keys and create a new key.",
    extraHelp:
      "Using a Claude Code subscription? You can extract your OAuth token from ~/.claude/.credentials.json - copy the accessToken field. This works as a bearer token in place of an API key.",
    placeholder: "sk-ant-...",
    models: [
      { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
      { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
      { value: "claude-sonnet-4-5-20241022", label: "Claude Sonnet 3.5 v2" },
      { value: "claude-haiku-3-5-20241022", label: "Claude Haiku 3.5" },
    ],
    defaultModel: "claude-sonnet-4-20250514",
  },
  {
    value: "openai",
    label: "OpenAI (GPT)",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    apiKeyLabel: "OpenAI Platform",
    apiKeyHelp: "Go to API Keys and create a new secret key.",
    placeholder: "sk-...",
    models: [
      { value: "gpt-4.1", label: "GPT-4.1" },
      { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
      { value: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
      { value: "gpt-4o", label: "GPT-4o" },
      { value: "gpt-4o-mini", label: "GPT-4o Mini" },
      { value: "o3", label: "o3" },
      { value: "o3-mini", label: "o3 Mini" },
      { value: "o4-mini", label: "o4 Mini" },
    ],
    defaultModel: "gpt-4.1",
  },
  {
    value: "google",
    label: "Google (Gemini)",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    apiKeyLabel: "Google AI Studio",
    apiKeyHelp: "Go to Get API Key and create a key for your project.",
    placeholder: "AIza...",
    models: [
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
    defaultModel: "gemini-2.5-flash",
  },
  {
    value: "xai",
    label: "xAI (Grok)",
    apiKeyUrl: "https://console.x.ai",
    apiKeyLabel: "xAI Console",
    apiKeyHelp: "Go to the console and generate an API key.",
    placeholder: "xai-...",
    models: [
      { value: "grok-3", label: "Grok 3" },
      { value: "grok-3-mini", label: "Grok 3 Mini" },
      { value: "grok-2", label: "Grok 2" },
    ],
    defaultModel: "grok-3",
  },
  {
    value: "groq",
    label: "Groq",
    apiKeyUrl: "https://console.groq.com/keys",
    apiKeyLabel: "Groq Console",
    apiKeyHelp: "Go to API Keys and create a new key.",
    placeholder: "gsk_...",
    models: [
      { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
      { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
      { value: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill 70B" },
    ],
    defaultModel: "llama-3.3-70b-versatile",
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    apiKeyUrl: "https://openrouter.ai/keys",
    apiKeyLabel: "OpenRouter",
    apiKeyHelp:
      "Create a new API key. OpenRouter gives you access to many models from different providers through a single API.",
    placeholder: "sk-or-...",
    models: [
      { value: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
      { value: "openai/gpt-4.1", label: "GPT-4.1" },
      { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { value: "meta-llama/llama-3.3-70b", label: "Llama 3.3 70B" },
    ],
    defaultModel: "anthropic/claude-sonnet-4",
  },
];

const DM_POLICIES = [
  { value: "pairing", label: "Pairing", description: "Agent responds to new DMs with a pairing flow before chatting freely. Recommended for most use cases." },
  { value: "open", label: "Open", description: "Agent responds to all direct messages from anyone." },
  { value: "allowlist", label: "Allowlist", description: "Agent only responds to DMs from users on the admin list." },
  { value: "disabled", label: "Disabled", description: "Agent does not respond to any direct messages." },
];

const GROUP_POLICIES = [
  { value: "open", label: "Open", description: "Agent responds when mentioned in any group it's a member of." },
  { value: "allowlist", label: "Allowlist", description: "Agent only responds in groups where an admin has explicitly allowed it." },
  { value: "disabled", label: "Disabled", description: "Agent ignores all group messages." },
];

const STEP_LABELS = ["Configure your AI model", "Set up Telegram credentials", "Optional integrations", "Verify and deploy"];

type VerifyStep = "idle" | "sending" | "code" | "2fa" | "verified";

export default function NewAgentPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customModel, setCustomModel] = useState(false);

  // Name availability
  const [nameStatus, setNameStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    slug: string;
    domain: string;
  }>({ checking: false, available: null, slug: "", domain: "" });

  // Telegram verification
  const [verifyStep, setVerifyStep] = useState<VerifyStep>("idle");
  const [sessionKey, setSessionKey] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sessionString, setSessionString] = useState("");

  const [form, setForm] = useState({
    name: "",
    provider: "anthropic",
    apiKey: "",
    model: "claude-sonnet-4-20250514",
    telegramApiId: "",
    telegramApiHash: "",
    telegramPhone: "",
    adminIds: "",
    dmPolicy: "pairing",
    groupPolicy: "open",
    ownerName: "",
    ownerUsername: "",
    tavilyApiKey: "",
    tonapiKey: "",
  });

  const currentProvider = LLM_PROVIDERS.find((p) => p.value === form.provider)!;

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Debounced name check
  const checkName = useCallback(async (name: string) => {
    if (!name.trim()) {
      setNameStatus({ checking: false, available: null, slug: "", domain: "" });
      return;
    }

    setNameStatus((prev) => ({ ...prev, checking: true }));

    try {
      const res = await fetch(
        `/api/agents/check-name?name=${encodeURIComponent(name)}`,
      );
      const data = await res.json();
      setNameStatus({
        checking: false,
        available: data.available,
        slug: data.slug || "",
        domain: data.domain || "",
      });
    } catch {
      setNameStatus((prev) => ({ ...prev, checking: false }));
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => checkName(form.name), 400);
    return () => clearTimeout(timer);
  }, [form.name, checkName]);

  // Step 4: Start Telegram verification (non-blocking + poll)
  const startVerification = async () => {
    setVerifyStep("sending");
    setError("");
    try {
      const res = await fetch("/api/telegram-session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiId: parseInt(form.telegramApiId, 10),
          apiHash: form.telegramApiHash,
          phone: form.telegramPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSessionKey(data.sessionKey);
      // Start polling - status will be "connecting" initially
      pollSessionStatus(data.sessionKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
      setVerifyStep("idle");
    }
  };

  const pollSessionStatus = (key: string) => {
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/telegram-session/status?sessionKey=${key}`,
        );
        if (!res.ok) {
          setError("Session expired or not found");
          setVerifyStep("idle");
          return;
        }
        const data = await res.json();
        if (data.status === "awaiting_code") {
          setVerifyStep("code");
          return;
        }
        if (data.status === "error") {
          setError(data.error || "Telegram connection failed");
          setVerifyStep("idle");
          return;
        }
        // Still connecting - poll again
        setTimeout(poll, 1000);
      } catch {
        setError("Connection lost");
        setVerifyStep("idle");
      }
    };
    poll();
  };

  const submitCode = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/telegram-session/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKey, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.status === "awaiting_2fa") {
        setVerifyStep("2fa");
      } else if (data.status === "completed") {
        setSessionString(data.sessionString);
        setVerifyStep("verified");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const submit2FA = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/telegram-session/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKey, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.status === "completed") {
        setSessionString(data.sessionString);
        setVerifyStep("verified");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "2FA verification failed");
    } finally {
      setLoading(false);
    }
  };

  // Auto-start verification when entering step 4
  useEffect(() => {
    if (step === 4 && verifyStep === "idle") {
      startVerification();
    }
  }, [step]);

  const handleDeploy = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          provider: form.provider,
          apiKey: form.apiKey,
          model: form.model,
          telegramApiId: parseInt(form.telegramApiId, 10),
          telegramApiHash: form.telegramApiHash,
          telegramPhone: form.telegramPhone,
          adminIds: form.adminIds
            .split(",")
            .map((id) => parseInt(id.trim(), 10))
            .filter((id) => !isNaN(id)),
          dmPolicy: form.dmPolicy,
          groupPolicy: form.groupPolicy,
          ownerName: form.ownerName || undefined,
          ownerUsername: form.ownerUsername || undefined,
          tavilyApiKey: form.tavilyApiKey || undefined,
          tonapiKey: form.tonapiKey || undefined,
          telegramSessionString: sessionString || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create agent");
      }

      const { agentId } = await res.json();
      router.push(`/dashboard/agents/${agentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const nameValid = form.name.trim().length > 0 && nameStatus.available === true;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Deploy New Agent</h1>

      {/* Step progress indicator */}
      <div className="mt-4 flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                s < step
                  ? "bg-green-500/20 text-green-400"
                  : s === step
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--secondary)] text-[var(--muted-foreground)]"
              }`}
            >
              {s < step ? <CircleCheck className="h-4 w-4" /> : s}
            </div>
            {s < 4 && (
              <div
                className={`h-0.5 w-8 rounded transition-colors ${
                  s < step ? "bg-green-500/40" : "bg-[var(--border)]"
                }`}
              />
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        {STEP_LABELS[step - 1]}
      </p>

      <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <Clock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-amber-400">Free 1-hour trial</p>
          <p className="mt-0.5 text-sm text-amber-200/70">
            Your first agent runs free for 1 hour. One trial agent per account - subscribe to keep it running or deploy more.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Step 1: Basic Info + LLM */}
      {step === 1 && (
        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Agent Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="My Teleton Agent"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            {form.name.trim() && (
              <div className="mt-1.5">
                {nameStatus.checking ? (
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Checking availability...
                  </p>
                ) : nameStatus.available === true ? (
                  <div>
                    <p className="text-xs text-green-400">
                      Available as <span className="font-mono">{nameStatus.slug}</span>
                    </p>
                    {nameStatus.domain && (
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Domain: <span className="font-mono">{nameStatus.domain}</span>
                      </p>
                    )}
                  </div>
                ) : nameStatus.available === false ? (
                  <p className="text-xs text-red-400">
                    Name already taken. Choose a different name.
                  </p>
                ) : null}
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              LLM Provider
            </label>
            <select
              value={form.provider}
              onChange={(e) => {
                const newProvider = LLM_PROVIDERS.find((p) => p.value === e.target.value)!;
                setForm((prev) => ({
                  ...prev,
                  provider: e.target.value,
                  model: newProvider.defaultModel,
                }));
                setCustomModel(false);
              }}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
            >
              {LLM_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">API Key</label>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => update("apiKey", e.target.value)}
              placeholder={currentProvider.placeholder}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--secondary)]/50 p-3">
              <p className="text-sm text-[var(--foreground)]/70">
                {currentProvider.apiKeyHelp}{" "}
                <a
                  href={currentProvider.apiKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                >
                  {currentProvider.apiKeyLabel}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
              {currentProvider.extraHelp && (
                <p className="mt-2 text-sm text-[var(--foreground)]/70 border-t border-[var(--border)] pt-2">
                  {currentProvider.extraHelp}
                </p>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Model</label>
            <select
              value={customModel ? "__custom__" : form.model}
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  setCustomModel(true);
                  update("model", "");
                } else {
                  setCustomModel(false);
                  update("model", e.target.value);
                }
              }}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
            >
              {currentProvider.models.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
              <option value="__custom__">Custom model...</option>
            </select>
            {customModel && (
              <input
                type="text"
                value={form.model}
                onChange={(e) => update("model", e.target.value)}
                placeholder="Enter model identifier"
                autoFocus
                className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
              />
            )}
          </div>
          <button
            onClick={() => setStep(2)}
            disabled={!nameValid || !form.apiKey}
            className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Next: Telegram Setup
          </button>
        </div>
      )}

      {/* Step 2: Telegram */}
      {step === 2 && (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--secondary)]/50 p-4 space-y-2">
            <p className="text-sm font-medium">Telegram API Credentials</p>
            <p className="text-sm text-[var(--foreground)]/70">
              Your agent uses a Telegram user account (not a bot) to send and receive messages.
              You need API credentials from Telegram to authenticate.
            </p>
            <ol className="text-sm text-[var(--foreground)]/70 list-decimal list-inside space-y-1">
              <li>
                Go to{" "}
                <a
                  href="https://my.telegram.org/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                >
                  my.telegram.org/apps
                  <ExternalLink className="h-3 w-3" />
                </a>{" "}
                and log in with your phone number
              </li>
              <li>Create a new application (any name/platform is fine)</li>
              <li>Copy the <strong className="text-[var(--foreground)]">API ID</strong> (a number) and <strong className="text-[var(--foreground)]">API Hash</strong> (a hex string)</li>
            </ol>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">API ID</label>
            <input
              type="text"
              value={form.telegramApiId}
              onChange={(e) => update("telegramApiId", e.target.value)}
              placeholder="12345678"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">API Hash</label>
            <input
              type="password"
              value={form.telegramApiHash}
              onChange={(e) => update("telegramApiHash", e.target.value)}
              placeholder="abc123..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Phone Number
            </label>
            <input
              type="text"
              value={form.telegramPhone}
              onChange={(e) => update("telegramPhone", e.target.value)}
              placeholder="+1234567890"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            <p className="mt-1.5 text-sm text-[var(--foreground)]/60">
              Include country code (e.g. +1). This is the Telegram account the agent will use.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Admin User IDs (comma-separated)
            </label>
            <input
              type="text"
              value={form.adminIds}
              onChange={(e) => update("adminIds", e.target.value)}
              placeholder="123456789"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            <p className="mt-1.5 text-sm text-[var(--foreground)]/60">
              Get your ID by messaging <span className="font-mono text-[var(--foreground)]">@userinfobot</span> on Telegram. Separate multiple IDs with commas.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                DM Policy
              </label>
              <select
                value={form.dmPolicy}
                onChange={(e) => update("dmPolicy", e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm"
              >
                {DM_POLICIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <p className="mt-1.5 text-sm text-[var(--foreground)]/60">
                {DM_POLICIES.find((p) => p.value === form.dmPolicy)?.description}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Group Policy
              </label>
              <select
                value={form.groupPolicy}
                onChange={(e) => update("groupPolicy", e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm"
              >
                {GROUP_POLICIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <p className="mt-1.5 text-sm text-[var(--foreground)]/60">
                {GROUP_POLICIES.find((p) => p.value === form.groupPolicy)?.description}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm hover:bg-[var(--accent)] transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={
                !form.telegramApiId ||
                !form.telegramApiHash ||
                !form.telegramPhone
              }
              className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Next: Optional Settings
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Optional Settings */}
      {step === 3 && (
        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Owner Name (optional)
            </label>
            <input
              type="text"
              value={form.ownerName}
              onChange={(e) => update("ownerName", e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm"
            />
            <p className="mt-1.5 text-sm text-[var(--foreground)]/60">
              A display name shown when the agent introduces itself.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Owner Username (optional)
            </label>
            <input
              type="text"
              value={form.ownerUsername}
              onChange={(e) => update("ownerUsername", e.target.value)}
              placeholder="@username"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm"
            />
            <p className="mt-1.5 text-sm text-[var(--foreground)]/60">
              Your Telegram @username. The agent may reference this when users ask who owns it.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Tavily API Key (optional)
            </label>
            <input
              type="password"
              value={form.tavilyApiKey}
              onChange={(e) => update("tavilyApiKey", e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm"
            />
            <p className="mt-1.5 text-sm text-[var(--foreground)]/60">
              Enables web search capabilities for your agent.{" "}
              <a
                href="https://tavily.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
              >
                Get a key at tavily.com
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              TonAPI Key (optional)
            </label>
            <input
              type="password"
              value={form.tonapiKey}
              onChange={(e) => update("tonapiKey", e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm"
            />
            <p className="mt-1.5 text-sm text-[var(--foreground)]/60">
              Provides higher rate limits for TON blockchain operations.{" "}
              <a
                href="https://tonapi.io"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
              >
                Get a key at tonapi.io
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm hover:bg-[var(--accent)] transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep(4)}
              className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Next: Verify Telegram
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Telegram Verification + Deploy */}
      {step === 4 && (
        <div className="mt-6 space-y-4">
          {/* Sending code */}
          {verifyStep === "sending" && (
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
              <p className="text-sm text-[var(--muted-foreground)]">
                Sending verification code to your Telegram...
              </p>
            </div>
          )}

          {/* Enter code */}
          {verifyStep === "code" && (
            <>
              <p className="text-sm text-[var(--muted-foreground)]">
                A verification code has been sent to your Telegram app.
              </p>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="12345"
                  maxLength={6}
                  autoFocus
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-center text-2xl tracking-[0.5em] font-mono"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setStep(3);
                    setVerifyStep("idle");
                    setCode("");
                    setError("");
                  }}
                  className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm hover:bg-[var(--accent)] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={submitCode}
                  disabled={loading || code.length < 5}
                  className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {loading ? "Verifying..." : "Verify Code"}
                </button>
              </div>
            </>
          )}

          {/* 2FA */}
          {verifyStep === "2fa" && (
            <>
              <p className="text-sm text-[var(--muted-foreground)]">
                This account has two-factor authentication enabled. Enter your
                password.
              </p>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  2FA Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={submit2FA}
                disabled={loading || !password}
                className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? "Verifying..." : "Submit Password"}
              </button>
            </>
          )}

          {/* Verified - ready to deploy */}
          {verifyStep === "verified" && (
            <>
              <div className="flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 p-4">
                <CircleCheck className="h-5 w-5 text-green-400 shrink-0" />
                <div>
                  <p className="font-medium text-green-400">
                    Telegram verified
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
                    Your account is authenticated and ready to go.
                  </p>
                </div>
              </div>
              <button
                onClick={handleDeploy}
                disabled={loading}
                className="w-full rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? "Deploying..." : "Deploy Agent"}
              </button>
              <p className="text-center text-xs text-[var(--muted-foreground)]">
                Starts with a 1-hour free trial. Subscribe anytime to keep your agent running.
              </p>
            </>
          )}

          {/* Error with retry */}
          {verifyStep === "idle" && error && (
            <button
              onClick={startVerification}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent)] transition-colors"
            >
              Retry Verification
            </button>
          )}
        </div>
      )}
    </div>
  );
}
