import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import {
  TELEGRAM_SESSION_TTL_MS,
  MAX_CONCURRENT_TELEGRAM_SESSIONS,
} from "@/lib/constants";

export type SessionStatus =
  | "connecting"
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
  agentId: string | null;
  userId: string;
  createdAt: number;
}

// In-memory map - GramJS clients hold live TCP connections and can't be serialized
// Stored on globalThis to survive Next.js hot-reloads in dev mode
const globalForTg = globalThis as unknown as {
  __telegramSessions?: Map<string, PendingSession>;
  __telegramCleanupInterval?: ReturnType<typeof setInterval> | null;
};

const pendingSessions = globalForTg.__telegramSessions ??= new Map<string, PendingSession>();

// Cleanup interval
let cleanupInterval = globalForTg.__telegramCleanupInterval ?? null;

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
      globalForTg.__telegramCleanupInterval = null;
    }
  }, 60_000);
  globalForTg.__telegramCleanupInterval = cleanupInterval;
}

/**
 * Start a Telegram auth session. Returns immediately -
 * the auth (including DC migration) runs in the background.
 * Frontend should poll getSessionStatus() until status changes
 * from "connecting" to "awaiting_code".
 */
export function startSession(
  sessionKey: string,
  apiId: number,
  apiHash: string,
  phone: string,
  agentId: string | null,
  userId: string,
): { status: SessionStatus; error?: string } {
  // Check concurrent limit
  if (pendingSessions.size >= MAX_CONCURRENT_TELEGRAM_SESSIONS) {
    return {
      status: "error",
      error: "Too many concurrent sessions. Please try again later.",
    };
  }

  // Clean up any existing pending sessions for this user
  for (const [key, session] of pendingSessions) {
    if (session.userId === userId) {
      cleanupSession(key);
    }
  }

  console.log(`[TG Session] Starting auth for phone=${phone}, apiId=${apiId}`);

  const client = new TelegramClient(
    new StringSession(""),
    apiId,
    apiHash,
    {
      connectionRetries: 5,
      retryDelay: 1000,
    },
  );

  const pending: PendingSession = {
    client,
    resolveCode: null,
    resolvePassword: null,
    status: "connecting",
    sessionString: null,
    error: null,
    agentId,
    userId,
    createdAt: Date.now(),
  };

  pendingSessions.set(sessionKey, pending);
  ensureCleanupRunning();

  // Start auth entirely in background - handles DC migration transparently
  client
    .start({
      phoneNumber: phone,
      phoneCode: () =>
        new Promise<string>((resolve) => {
          console.log("[TG Session] Code requested by Telegram");
          pending.status = "awaiting_code";
          pending.resolveCode = resolve;
        }),
      password: () =>
        new Promise<string>((resolve) => {
          console.log("[TG Session] 2FA password requested by Telegram");
          pending.status = "awaiting_2fa";
          pending.resolvePassword = resolve;
        }),
      onError: (err: Error) => {
        console.error("[TG Session] Auth error:", err.message);
        // TIMEOUT errors are transient connection errors during DC migration.
        // GramJS handles reconnection internally, so don't treat them as fatal.
        if (err.message === "TIMEOUT") return;
        pending.status = "error";
        pending.error = err.message;
      },
    })
    .then(() => {
      console.log("[TG Session] Auth completed successfully");
      pending.sessionString = client.session.save() as unknown as string;
      pending.status = "completed";
    })
    .catch((err: Error) => {
      console.error("[TG Session] Auth failed:", err.message);
      pending.status = "error";
      pending.error = err.message;
    });

  // Return immediately - frontend will poll for status
  return { status: "connecting" };
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
  agentId?: string | null;
  error?: string;
} | null {
  const session = pendingSessions.get(sessionKey);
  if (!session) return null;

  // Keep-alive: reset TTL on each poll so active sessions don't expire
  session.createdAt = Date.now();

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
