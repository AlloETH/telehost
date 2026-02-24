"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import {
  useTelegramBackButton,
  useTelegramMainButton,
  useTelegramHaptic,
} from "@/lib/hooks/use-telegram";

type Step = "connecting" | "code" | "2fa" | "success" | "error";

export default function TMASessionSetupPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const router = useRouter();
  const haptic = useTelegramHaptic();
  const [step, setStep] = useState<Step>("connecting");
  const [sessionKey, setSessionKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(false);

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  useTelegramBackButton(() => router.push(`/tma/agents/${agentId}`));

  // MainButton for submit actions
  const mainButtonText =
    step === "code" ? "Verify Code" :
    step === "2fa" ? "Submit Password" :
    step === "success" ? "Go to Agent" :
    step === "error" ? "Retry" : "";

  const mainButtonAction = () => {
    if (step === "code") submitCode();
    else if (step === "2fa") submit2FA();
    else if (step === "success") router.push(`/tma/agents/${agentId}`);
    else if (step === "error") retry();
  };

  const mainButtonDisabled =
    loading ||
    (step === "code" && code.length < 5) ||
    (step === "2fa" && !password);

  useTelegramMainButton(
    mainButtonText || "Loading...",
    mainButtonAction,
    {
      disabled: mainButtonDisabled || step === "connecting",
      loading,
    },
  );

  const pollStatus = (key: string) => {
    pollRef.current = true;
    const poll = async () => {
      if (!pollRef.current) return;
      try {
        const res = await fetch(`/api/telegram-session/status?sessionKey=${key}`);
        if (!res.ok) {
          setError("Session expired or not found");
          setStep("error");
          return;
        }
        const data = await res.json();
        if (data.status === "awaiting_code") {
          setStep("code");
          haptic.notification("success");
          return;
        }
        if (data.status === "error") {
          setError(data.error || "Telegram connection failed");
          setStep("error");
          haptic.notification("error");
          return;
        }
        setTimeout(poll, 1000);
      } catch {
        setError("Connection lost");
        setStep("error");
      }
    };
    poll();
  };

  useEffect(() => {
    const start = async () => {
      setError("");
      try {
        const res = await fetch("/api/telegram-session/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setSessionKey(data.sessionKey);
        pollStatus(data.sessionKey);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start session");
        setStep("error");
      }
    };
    start();
    return () => { pollRef.current = false; };
  }, [agentId]);

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
        haptic.notification("success");
      } else if (data.status === "error") {
        throw new Error(data.error || "Verification failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      haptic.notification("error");
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
        haptic.notification("success");
      } else if (data.status === "error") {
        throw new Error(data.error || "2FA failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "2FA failed");
      haptic.notification("error");
    } finally {
      setLoading(false);
    }
  };

  const retry = () => {
    setError("");
    setStep("connecting");
    setSessionKey("");
    setCode("");
    setPassword("");
    const start = async () => {
      try {
        const res = await fetch("/api/telegram-session/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setSessionKey(data.sessionKey);
        pollStatus(data.sessionKey);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start session");
        setStep("error");
      }
    };
    start();
  };

  return (
    <div className="px-4 pt-4">
      <h1 className="text-xl font-bold">Telegram Session</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Authenticate to activate your agent.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {step === "connecting" && (
        <div className="mt-8 flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--muted-foreground)]">Connecting to Telegram...</p>
        </div>
      )}

      {step === "code" && (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            Enter the code sent to your Telegram app.
          </p>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="12345"
            maxLength={6}
            autoFocus
            inputMode="numeric"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 text-center text-3xl tracking-[0.5em] font-mono"
          />
        </div>
      )}

      {step === "2fa" && (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            This account has 2FA enabled. Enter your password.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm"
          />
        </div>
      )}

      {step === "success" && (
        <div className="mt-8 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
            <CircleCheck className="h-8 w-8 text-green-400" />
          </div>
          <h2 className="mt-4 text-xl font-bold">Session Activated</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Your agent is starting up.
          </p>
        </div>
      )}
    </div>
  );
}
