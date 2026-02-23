"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const LLM_PROVIDERS = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI (GPT)" },
  { value: "google", label: "Google (Gemini)" },
  { value: "xai", label: "xAI (Grok)" },
  { value: "groq", label: "Groq" },
  { value: "openrouter", label: "OpenRouter" },
];

export default function NewAgentPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Name availability
  const [nameStatus, setNameStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    slug: string;
    domain: string;
  }>({ checking: false, available: null, slug: "", domain: "" });

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

  const handleSubmit = async () => {
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
      <p className="mt-1 text-[var(--muted-foreground)]">
        Step {step} of 3
      </p>

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
            {/* Name availability feedback */}
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
              onChange={(e) => update("provider", e.target.value)}
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
              placeholder="sk-..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Model</label>
            <input
              type="text"
              value={form.model}
              onChange={(e) => update("model", e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
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
          <p className="text-sm text-[var(--muted-foreground)]">
            Get your API ID and Hash from{" "}
            <a
              href="https://my.telegram.org/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--primary)] underline"
            >
              my.telegram.org/apps
            </a>
          </p>
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
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Get your ID from @userinfobot on Telegram
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
                <option value="pairing">Pairing</option>
                <option value="allowlist">Allowlist</option>
                <option value="open">Open</option>
                <option value="disabled">Disabled</option>
              </select>
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
                <option value="open">Open</option>
                <option value="allowlist">Allowlist</option>
                <option value="disabled">Disabled</option>
              </select>
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

      {/* Step 3: Optional + Deploy */}
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
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Tavily API Key (optional, for web search)
            </label>
            <input
              type="password"
              value={form.tavilyApiKey}
              onChange={(e) => update("tavilyApiKey", e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              TonAPI Key (optional, for higher rate limits)
            </label>
            <input
              type="password"
              value={form.tonapiKey}
              onChange={(e) => update("tonapiKey", e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm hover:bg-[var(--accent)] transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? "Deploying..." : "Deploy Agent"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
