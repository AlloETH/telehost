"use client";

import { useState, use } from "react";
import Link from "next/link";

type Step = "phone" | "code" | "2fa" | "success" | "error";

export default function SessionSetupPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const [step, setStep] = useState<Step>("phone");
  const [sessionKey, setSessionKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [phone, setPhone] = useState("");
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  const startSession = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/telegram-session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          apiId: parseInt(apiId, 10),
          apiHash,
          phone,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSessionKey(data.sessionKey);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
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
        body: JSON.stringify({ sessionKey, code }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.status === "awaiting_2fa") {
        setStep("2fa");
      } else if (data.status === "completed") {
        setStep("success");
      } else if (data.status === "error") {
        throw new Error(data.error || "Verification failed");
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
        setStep("success");
      } else if (data.status === "error") {
        throw new Error(data.error || "2FA verification failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "2FA verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <Link
        href={`/dashboard/agents/${agentId}`}
        className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        &larr; Back to Agent
      </Link>
      <h1 className="mt-4 text-2xl font-bold">Telegram Session Setup</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Authenticate with Telegram to activate your agent.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Step: Phone */}
      {step === "phone" && (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            Enter the Telegram credentials for the account your agent will use.
            We recommend using a dedicated account.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium">API ID</label>
            <input
              type="text"
              value={apiId}
              onChange={(e) => setApiId(e.target.value)}
              placeholder="12345678"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">API Hash</label>
            <input
              type="password"
              value={apiHash}
              onChange={(e) => setApiHash(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Phone Number
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1234567890"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={startSession}
            disabled={loading || !apiId || !apiHash || !phone}
            className="w-full rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Sending code..." : "Send Verification Code"}
          </button>
        </div>
      )}

      {/* Step: Code */}
      {step === "code" && (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            A verification code has been sent to your Telegram app. Enter it
            below.
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
          <button
            onClick={submitCode}
            disabled={loading || code.length < 5}
            className="w-full rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Verifying..." : "Verify Code"}
          </button>
        </div>
      )}

      {/* Step: 2FA */}
      {step === "2fa" && (
        <div className="mt-6 space-y-4">
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
            className="w-full rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Verifying..." : "Submit Password"}
          </button>
        </div>
      )}

      {/* Step: Success */}
      {step === "success" && (
        <div className="mt-6 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
            <span className="text-3xl text-green-400">&#10003;</span>
          </div>
          <h2 className="mt-4 text-xl font-bold">Session Activated</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Your agent is now starting up. It may take a minute to connect.
          </p>
          <Link
            href={`/dashboard/agents/${agentId}`}
            className="mt-6 inline-block rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            Go to Agent
          </Link>
        </div>
      )}
    </div>
  );
}
