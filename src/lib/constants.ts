export const SUBSCRIPTION_TIERS = {
  free: {
    name: "Free",
    maxAgents: 1,
    memoryLimitMb: 256,
    cpuLimit: "0.25",
    priceNanoton: "0",
    priceTon: 0,
    trialDays: 7,
  },
  basic: {
    name: "Basic",
    maxAgents: 1,
    memoryLimitMb: 512,
    cpuLimit: "0.5",
    priceNanoton: "5000000000",
    priceTon: 5,
    trialDays: 0,
  },
  pro: {
    name: "Pro",
    maxAgents: 3,
    memoryLimitMb: 1024,
    cpuLimit: "1.0",
    priceNanoton: "12000000000",
    priceTon: 12,
    trialDays: 0,
  },
  enterprise: {
    name: "Enterprise",
    maxAgents: 10,
    memoryLimitMb: 2048,
    cpuLimit: "2.0",
    priceNanoton: "30000000000",
    priceTon: 30,
    trialDays: 0,
  },
} as const;

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS;

export const TELETON_DOCKER_IMAGE = "ghcr.io/tonresistor/teleton-agent";
export const TELETON_DOCKER_TAG = "latest";
export const TELETON_WEBUI_PORT = "7777";

export const AGENT_MAX_RESTART_ATTEMPTS = 3;
export const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const SUBSCRIPTION_GRACE_PERIOD_DAYS = 3;

export const TELEGRAM_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_CONCURRENT_TELEGRAM_SESSIONS = 10;
