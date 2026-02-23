import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import {
  TELEGRAM_SESSION_TTL_MS,
  MAX_CONCURRENT_TELEGRAM_SESSIONS,
} from "@/lib/constants";

export type SessionStatus =
  | "awaiting_code"
  | "awaiting_2fa"
  | "completed"
  | "error";

interface PendingSession {
  client: TelegramClient;
  resolveCode: ((code: string) => void) | null;
  resolvePassword: ((password: string) => void) | null;
  status: SessionStatus;
  sessionString: string | null;
  error: string | null;
  agentId: string;
  userId: string;
  createdAt: number;
}

// In-memory map — GramJS clients hold live TCP connections and can't be serialized
const pendingSessions = new Map<string, PendingSession>();

// Cleanup interval
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function ensureCleanupRunning() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, session] of pendingSessions) {
      if (now - session.createdAt > TELEGRAM_SESSION_TTL_MS) {
        cleanupSession(key);
      }
    }
    if (pendingSessions.size === 0 && cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
  }, 60_000);
}

export async function startSession(
  sessionKey: string,
  apiId: number,
  apiHash: string,
  phone: string,
  agentId: string,
  userId: string,
): Promise<{ status: SessionStatus; error?: string }> {
  // Check concurrent limit
  if (pendingSessions.size >= MAX_CONCURRENT_TELEGRAM_SESSIONS) {
    return {
      status: "error",
      error: "Too many concurrent sessions. Please try again later.",
    };
  }

  // Check if user already has a pending session
  for (const [, session] of pendingSessions) {
    if (session.userId === userId && session.status !== "completed" && session.status !== "error") {
      return {
        status: "error",
        error: "You already have a pending session. Please complete or wait for it to expire.",
      };
    }
  }

  const client = new TelegramClient(
    new StringSession(""),
    apiId,
    apiHash,
    { connectionRetries: 3 },
  );

  const pending: PendingSession = {
    client,
    resolveCode: null,
    resolvePassword: null,
    status: "awaiting_code",
    sessionString: null,
    error: null,
    agentId,
    userId,
    createdAt: Date.now(),
  };

  pendingSessions.set(sessionKey, pending);
  ensureCleanupRunning();

  // Start auth in background
  client
    .start({
      phoneNumber: phone,
      phoneCode: () =>
        new Promise<string>((resolve) => {
          pending.resolveCode = resolve;
        }),
      password: () =>
        new Promise<string>((resolve) => {
          pending.status = "awaiting_2fa";
          pending.resolvePassword = resolve;
        }),
      onError: (err: Error) => {
        pending.status = "error";
        pending.error = err.message;
      },
    })
    .then(() => {
      pending.sessionString = client.session.save() as unknown as string;
      pending.status = "completed";
    })
    .catch((err: Error) => {
      pending.status = "error";
      pending.error = err.message;
    });

  // Wait for Telegram to process the phone number
  await new Promise((r) => setTimeout(r, 3000));

  return { status: pending.status, error: pending.error ?? undefined };
}

export function submitCode(
  sessionKey: string,
  code: string,
): { status: SessionStatus; error?: string } {
  const session = pendingSessions.get(sessionKey);
  if (!session) {
    return { status: "error", error: "Session not found or expired" };
  }

  if (session.status !== "awaiting_code") {
    return {
      status: session.status,
      error: `Expected awaiting_code, got ${session.status}`,
    };
  }

  if (!session.resolveCode) {
    return { status: "error", error: "Code callback not ready" };
  }

  session.resolveCode(code);
  session.resolveCode = null;

  return { status: session.status };
}

export function submit2FA(
  sessionKey: string,
  password: string,
): { status: SessionStatus; error?: string } {
  const session = pendingSessions.get(sessionKey);
  if (!session) {
    return { status: "error", error: "Session not found or expired" };
  }

  if (session.status !== "awaiting_2fa") {
    return {
      status: session.status,
      error: `Expected awaiting_2fa, got ${session.status}`,
    };
  }

  if (!session.resolvePassword) {
    return { status: "error", error: "Password callback not ready" };
  }

  session.resolvePassword(password);
  session.resolvePassword = null;

  return { status: session.status };
}

export function getSessionStatus(
  sessionKey: string,
): {
  status: SessionStatus;
  sessionString?: string;
  agentId?: string;
  error?: string;
} | null {
  const session = pendingSessions.get(sessionKey);
  if (!session) return null;

  return {
    status: session.status,
    sessionString:
      session.status === "completed" ? session.sessionString ?? undefined : undefined,
    agentId: session.agentId,
    error: session.error ?? undefined,
  };
}

export function cleanupSession(sessionKey: string): void {
  const session = pendingSessions.get(sessionKey);
  if (session) {
    try {
      session.client.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    pendingSessions.delete(sessionKey);
  }
}
