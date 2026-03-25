"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Clock, ExternalLink, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";
import {
  useTelegramBackButton,
  useTelegramMainButton,
  useTelegramHaptic,
} from "@/lib/hooks/use-telegram";
import { useApp } from "@/components/app-provider";
import { apiFetch } from "@/lib/api";

interface ProviderModel {
  value: string;
  label: string;
}

interface LLMProvider {
  value: string;
  label: string;
  apiKeyUrl: string;
  apiKeyHelp: string;
  placeholder: string;
  models: ProviderModel[];
  defaultModel: string;
}

const LLM_PROVIDERS: LLMProvider[] = [
  {
    value: "anthropic",
    label: "Anthropic (Claude)",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    apiKeyHelp: "Settings > API Keys > Create key",
    placeholder: "sk-ant-...",
    models: [
      { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
      { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
      { value: "claude-opus-4-5-20251101", label: "Claude Opus 4.5" },
      { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
      { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    ],
    defaultModel: "claude-sonnet-4-6",
  },
  {
    value: "openai",
    label: "OpenAI (GPT)",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    apiKeyHelp: "API Keys > Create new secret key",
    placeholder: "sk-...",
    models: [
      { value: "gpt-5.2", label: "GPT-5.2" },
      { value: "gpt-5.2-pro", label: "GPT-5.2 Pro" },
      { value: "gpt-5", label: "GPT-5" },
      { value: "gpt-5-mini", label: "GPT-5 Mini" },
      { value: "o3-pro", label: "o3 Pro" },
      { value: "o3", label: "o3" },
      { value: "o4-mini", label: "o4 Mini" },
      { value: "gpt-4.1", label: "GPT-4.1" },
    ],
    defaultModel: "gpt-5.2",
  },
  {
    value: "google",
    label: "Google (Gemini)",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    apiKeyHelp: "Get API Key > Create key",
    placeholder: "AIza...",
    models: [
      { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)" },
      { value: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)" },
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
    ],
    defaultModel: "gemini-2.5-flash",
  },
  {
    value: "xai",
    label: "xAI (Grok)",
    apiKeyUrl: "https://console.x.ai",
    apiKeyHelp: "Generate an API key from the console",
    placeholder: "xai-...",
    models: [
      { value: "grok-4-1-fast-reasoning", label: "Grok 4.1 Fast (Reasoning)" },
      { value: "grok-4-1-fast-non-reasoning", label: "Grok 4.1 Fast" },
      { value: "grok-code-fast-1", label: "Grok Code Fast" },
      { value: "grok-3", label: "Grok 3" },
      { value: "grok-3-mini", label: "Grok 3 Mini" },
    ],
    defaultModel: "grok-4-1-fast-non-reasoning",
  },
  {
    value: "groq",
    label: "Groq",
    apiKeyUrl: "https://console.groq.com/keys",
    apiKeyHelp: "API Keys > Create new key",
    placeholder: "gsk_...",
    models: [
      { value: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
      { value: "openai/gpt-oss-20b", label: "GPT-OSS 20B" },
      { value: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B" },
      { value: "moonshotai/kimi-k2-instruct-0905", label: "Kimi K2" },
      { value: "qwen/qwen3-32b", label: "Qwen3 32B" },
      { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { value: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill 70B" },
    ],
    defaultModel: "llama-3.3-70b-versatile",
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    apiKeyUrl: "https://openrouter.ai/keys",
    apiKeyHelp: "Create API key for multi-provider access",
    placeholder: "sk-or-...",
    models: [
      { value: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
      { value: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6" },
      { value: "openai/gpt-5.2", label: "GPT-5.2" },
      { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { value: "x-ai/grok-4-1-fast-non-reasoning", label: "Grok 4.1 Fast" },
      { value: "deepseek/deepseek-v3-0324", label: "DeepSeek V3" },
      { value: "meta-llama/llama-4-scout", label: "Llama 4 Scout" },
    ],
    defaultModel: "anthropic/claude-sonnet-4.6",
  },
];

export default function TMADeployPage() {
  const router = useRouter();
  const { isTMA } = useApp();
  const haptic = useTelegramHaptic();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showChannels, setShowChannels] = useState(false);

  const [nameStatus, setNameStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    slug: string;
  }>({ checking: false, available: null, slug: "" });

  const [form, setForm] = useState({
    name: "",
    provider: "anthropic",
    apiKey: "",
    model: "claude-sonnet-4-6",
    telegramBotToken: "",
    discordBotToken: "",
    slackBotToken: "",
    slackAppToken: "",
  });

  const currentProvider = LLM_PROVIDERS.find((p) => p.value === form.provider)!;

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Back button navigates steps
  useTelegramBackButton(
    step > 1 ? () => setStep((s) => s - 1) : () => router.push("/app"),
  );

  // Main button
  const mainButtonText = step === 1 ? "Next" : "Deploy";

  const canProceed = () => {
    if (step === 1) return !!form.name && !!form.apiKey && nameStatus.available === true;
    if (step === 2) return true;
    return true;
  };

  const mainButtonAction = () => {
    if (step === 1) {
      haptic.impact("light");
      setStep(2);
    } else if (step === 2) {
      deploy();
    }
  };

  useTelegramMainButton(mainButtonText, mainButtonAction, {
    disabled: !canProceed() || loading,
    loading,
  });

  // Name checking
  const checkName = useCallback(async (name: string) => {
    if (!name.trim()) {
      setNameStatus({ checking: false, available: null, slug: "" });
      return;
    }
    setNameStatus((prev) => ({ ...prev, checking: true }));
    try {
      const res = await apiFetch(`/agents/check-name?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      setNameStatus({ checking: false, available: data.available, slug: data.slug || "" });
    } catch {
      setNameStatus({ checking: false, available: null, slug: "" });
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => checkName(form.name), 400);
    return () => clearTimeout(t);
  }, [form.name, checkName]);

  const deploy = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          provider: form.provider,
          apiKey: form.apiKey,
          model: form.model,
          telegramBotToken: form.telegramBotToken || undefined,
          discordBotToken: form.discordBotToken || undefined,
          slackBotToken: form.slackBotToken || undefined,
          slackAppToken: form.slackAppToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      haptic.notification("success");
      router.push(`/app/agents/${data.agentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed");
      haptic.notification("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 pt-4">
      {/* Progress */}
      <div className="flex items-center gap-1 mb-4">
        {[1, 2].map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full ${
              s <= step ? "bg-[var(--primary)]" : "bg-[var(--border)]"
            }`}
          />
        ))}
      </div>

      <h1 className="text-lg font-bold mb-1">
        {step === 1 && "AI Model"}
        {step === 2 && "Review & Deploy"}
      </h1>

      {/* Trial banner */}
      <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 mb-4">
        <Clock className="h-4 w-4 text-amber-400 shrink-0" />
        <p className="text-xs text-amber-400">Free 1-hour trial - no payment needed</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400 mb-4">
          {error}
        </div>
      )}

      {/* Step 1: Model */}
      {step === 1 && (
        <div className="space-y-4">
          <Field label="Instance Name" value={form.name} onChange={(v) => update("name", v)} placeholder="My OpenClaw" />
          {nameStatus.checking && <p className="text-xs text-[var(--muted-foreground)]">Checking...</p>}
          {nameStatus.available === true && <p className="text-xs text-green-400">Available - {nameStatus.slug}</p>}
          {nameStatus.available === false && <p className="text-xs text-red-400">Name taken</p>}

          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">Provider</label>
            <select
              value={form.provider}
              onChange={(e) => {
                const p = LLM_PROVIDERS.find((x) => x.value === e.target.value)!;
                setForm((prev) => ({ ...prev, provider: p.value, model: p.defaultModel }));
              }}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-base appearance-none"
            >
              {LLM_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">Model</label>
            <select
              value={form.model}
              onChange={(e) => update("model", e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-base appearance-none"
            >
              {currentProvider.models.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <Field
            label="API Key"
            value={form.apiKey}
            onChange={(v) => update("apiKey", v)}
            placeholder={currentProvider.placeholder}
            type="password"
          />
          <a
            href={currentProvider.apiKeyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[var(--primary)]"
          >
            Get API key <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {/* Step 2: Review & Deploy */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Name</span><span>{form.name}</span></div>
            <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Provider</span><span className="capitalize">{form.provider}</span></div>
            <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Model</span><span className="truncate ml-4">{form.model}</span></div>
            {nameStatus.slug && (
              <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">URL</span><span className="truncate ml-4 text-[var(--primary)]">{nameStatus.slug}.server.tokn.deal</span></div>
            )}
          </div>

          <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
            <p className="text-xs text-[var(--foreground)]/70">
              After deploy, use the OpenClaw Control UI to configure channels, agent personality, tools, and more.
            </p>
          </div>

          {/* Optional channels */}
          <button
            onClick={() => setShowChannels(!showChannels)}
            className="w-full flex items-center justify-between rounded-xl border border-[var(--border)] p-3 text-sm"
          >
            <span className="text-[var(--muted-foreground)]">Add channels (optional)</span>
            {showChannels ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showChannels && (
            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
              <p className="text-xs text-[var(--muted-foreground)]">
                Connect messaging channels now or later via the Control UI.
              </p>
              <Field
                label="Telegram Bot Token"
                value={form.telegramBotToken}
                onChange={(v) => update("telegramBotToken", v)}
                placeholder="123456:ABC-DEF..."
                type="password"
              />
              <Field
                label="Discord Bot Token"
                value={form.discordBotToken}
                onChange={(v) => update("discordBotToken", v)}
                placeholder="Bot token from Discord Developer Portal"
                type="password"
              />
              <Field
                label="Slack Bot Token"
                value={form.slackBotToken}
                onChange={(v) => update("slackBotToken", v)}
                placeholder="xoxb-..."
                type="password"
              />
              {form.slackBotToken && (
                <Field
                  label="Slack App Token"
                  value={form.slackAppToken}
                  onChange={(v) => update("slackAppToken", v)}
                  placeholder="xapp-..."
                  type="password"
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Desktop action buttons (TMA uses native MainButton) */}
      {!isTMA && (
        <div className="flex items-center gap-3 mt-6">
          {step > 1 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-5 py-3 text-sm font-medium hover:bg-[var(--accent)] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          )}
          <button
            onClick={mainButtonAction}
            disabled={!canProceed() || loading}
            className="flex-1 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-medium text-white hover:brightness-110 transition-all disabled:opacity-50"
          >
            {loading ? "Deploying..." : mainButtonText}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "numeric" | "tel" | "text";
}) {
  return (
    <div>
      <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">{label}</label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-base focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
      />
    </div>
  );
}
