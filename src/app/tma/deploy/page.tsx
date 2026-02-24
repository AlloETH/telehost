"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Clock, CircleCheck, ExternalLink } from "lucide-react";
import {
  useTelegramBackButton,
  useTelegramMainButton,
  useTelegramHaptic,
} from "@/lib/hooks/use-telegram";

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

const DM_POLICIES = [
  { value: "pairing", label: "Pairing" },
  { value: "open", label: "Open" },
  { value: "allowlist", label: "Allowlist" },
  { value: "disabled", label: "Disabled" },
];

const GROUP_POLICIES = [
  { value: "open", label: "Open" },
  { value: "allowlist", label: "Allowlist" },
  { value: "disabled", label: "Disabled" },
];

type VerifyStep = "idle" | "sending" | "code" | "2fa" | "verified";

export default function TMADeployPage() {
  const router = useRouter();
  const haptic = useTelegramHaptic();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(false);

  const [verifyStep, setVerifyStep] = useState<VerifyStep>("idle");
  const [sessionKey, setSessionKey] = useState("");
  const [tgCode, setTgCode] = useState("");
  const [tgPassword, setTgPassword] = useState("");
  const [sessionString, setSessionString] = useState("");

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
    telegramApiId: "",
    telegramApiHash: "",
    telegramPhone: "",
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

  // Back button navigates steps
  useTelegramBackButton(
    step > 1 ? () => setStep((s) => s - 1) : () => router.push("/tma"),
  );

  // Main button
  const mainButtonText =
    step < 4 ? "Next" :
    verifyStep === "code" ? "Verify Code" :
    verifyStep === "2fa" ? "Submit Password" :
    verifyStep === "verified" ? "Deploy Agent" :
    "Start Verification";

  const canProceed = () => {
    if (step === 1) return !!form.name && !!form.apiKey && nameStatus.available === true;
    if (step === 2) return !!form.telegramApiId && !!form.telegramApiHash && !!form.telegramPhone;
    if (step === 3) return true;
    if (step === 4) {
      if (verifyStep === "code") return tgCode.length >= 5;
      if (verifyStep === "2fa") return !!tgPassword;
      return true;
    }
    return true;
  };

  const mainButtonAction = () => {
    if (step < 4) {
      haptic.impact("light");
      setStep((s) => s + 1);
    } else if (step === 4) {
      if (verifyStep === "idle") startVerification();
      else if (verifyStep === "code") submitCode();
      else if (verifyStep === "2fa") submit2FA();
      else if (verifyStep === "verified") deploy();
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
      const res = await fetch(`/api/agents/check-name?name=${encodeURIComponent(name)}`);
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

  // Telegram verification
  const pollStatus = (key: string) => {
    pollRef.current = true;
    const poll = async () => {
      if (!pollRef.current) return;
      try {
        const res = await fetch(`/api/telegram-session/status?sessionKey=${key}`);
        const data = await res.json();
        if (data.status === "awaiting_code") {
          setVerifyStep("code");
          haptic.notification("success");
          return;
        }
        if (data.status === "completed") {
          setSessionString(data.sessionString || "");
          setVerifyStep("verified");
          haptic.notification("success");
          return;
        }
        if (data.status === "error") {
          setError(data.error || "Verification failed");
          setVerifyStep("idle");
          return;
        }
        setTimeout(poll, 1000);
      } catch {
        setError("Connection lost");
        setVerifyStep("idle");
      }
    };
    poll();
  };

  const startVerification = async () => {
    setLoading(true);
    setError("");
    setVerifyStep("sending");
    try {
      const res = await fetch("/api/telegram-session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiId: parseInt(form.telegramApiId),
          apiHash: form.telegramApiHash,
          phone: form.telegramPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSessionKey(data.sessionKey);
      pollStatus(data.sessionKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
      setVerifyStep("idle");
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/telegram-session/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKey, code: tgCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.status === "awaiting_2fa") setVerifyStep("2fa");
      else if (data.status === "completed") {
        setSessionString(data.sessionString || "");
        setVerifyStep("verified");
        haptic.notification("success");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
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
        body: JSON.stringify({ sessionKey, password: tgPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.status === "completed") {
        setSessionString(data.sessionString || "");
        setVerifyStep("verified");
        haptic.notification("success");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => { pollRef.current = false; };
  }, []);

  const deploy = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sessionString }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      haptic.notification("success");
      router.push(`/tma/agents/${data.agent.id}`);
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
        {[1, 2, 3, 4].map((s) => (
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
        {step === 2 && "Telegram"}
        {step === 3 && "Integrations"}
        {step === 4 && "Verify & Deploy"}
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
          <Field label="Agent Name" value={form.name} onChange={(v) => update("name", v)} placeholder="My Agent" />
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

      {/* Step 2: Telegram */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
            <p className="text-xs text-[var(--foreground)]/70">
              Get credentials at my.telegram.org: Login &gt; API Development Tools &gt; Create Application.
            </p>
          </div>
          <Field label="API ID" value={form.telegramApiId} onChange={(v) => update("telegramApiId", v)} placeholder="12345678" inputMode="numeric" />
          <Field label="API Hash" value={form.telegramApiHash} onChange={(v) => update("telegramApiHash", v)} placeholder="0123456789abcdef..." />
          <Field label="Phone Number" value={form.telegramPhone} onChange={(v) => update("telegramPhone", v)} placeholder="+1234567890" type="tel" />

          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">DM Policy</label>
            <select value={form.dmPolicy} onChange={(e) => update("dmPolicy", e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-base appearance-none">
              {DM_POLICIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">Group Policy</label>
            <select value={form.groupPolicy} onChange={(e) => update("groupPolicy", e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-base appearance-none">
              {GROUP_POLICIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Step 3: Optional integrations */}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">These are optional. You can add them later.</p>
          <Field label="Owner Display Name" value={form.ownerName} onChange={(v) => update("ownerName", v)} placeholder="Your name" />
          <Field label="Owner Username" value={form.ownerUsername} onChange={(v) => update("ownerUsername", v)} placeholder="@username" />
          <Field label="Tavily API Key (web search)" value={form.tavilyApiKey} onChange={(v) => update("tavilyApiKey", v)} type="password" placeholder="tvly-..." />
          <Field label="TonAPI Key (blockchain)" value={form.tonapiKey} onChange={(v) => update("tonapiKey", v)} type="password" placeholder="AE..." />
        </div>
      )}

      {/* Step 4: Verify & Deploy */}
      {step === 4 && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Name</span><span>{form.name}</span></div>
            <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Provider</span><span className="capitalize">{form.provider}</span></div>
            <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Model</span><span className="truncate ml-4">{form.model}</span></div>
            <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Phone</span><span>{form.telegramPhone}</span></div>
          </div>

          {/* Verification status */}
          {verifyStep === "sending" && (
            <div className="flex items-center gap-3 p-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
              <p className="text-sm text-[var(--muted-foreground)]">Connecting to Telegram...</p>
            </div>
          )}

          {verifyStep === "code" && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--muted-foreground)]">Enter the code from Telegram.</p>
              <input
                type="text"
                value={tgCode}
                onChange={(e) => setTgCode(e.target.value)}
                placeholder="12345"
                maxLength={6}
                autoFocus
                inputMode="numeric"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 text-center text-3xl tracking-[0.5em] font-mono"
              />
            </div>
          )}

          {verifyStep === "2fa" && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--muted-foreground)]">Enter your 2FA password.</p>
              <input
                type="password"
                value={tgPassword}
                onChange={(e) => setTgPassword(e.target.value)}
                autoFocus
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm"
              />
            </div>
          )}

          {verifyStep === "verified" && (
            <div className="flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/5 p-3">
              <CircleCheck className="h-5 w-5 text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-400">Verified</p>
                <p className="text-xs text-[var(--muted-foreground)]">Tap Deploy to launch your agent</p>
              </div>
            </div>
          )}
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
