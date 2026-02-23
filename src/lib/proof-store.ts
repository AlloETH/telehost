// In-memory store for TON Connect proof challenges.
// Challenges are short-lived (5 min) and instance-local, so no Redis needed.

const store = new Map<string, number>(); // payload -> expiry timestamp

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL = 60 * 1000; // sweep every 60s

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, expiry] of store) {
      if (now > expiry) store.delete(key);
    }
    if (store.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, CLEANUP_INTERVAL);
}

export function setProofPayload(payload: string): void {
  store.set(payload, Date.now() + TTL_MS);
  ensureCleanup();
}

export function consumeProofPayload(payload: string): boolean {
  const expiry = store.get(payload);
  if (!expiry) return false;
  store.delete(payload);
  return Date.now() <= expiry;
}
