export const SUBSCRIPTION_TIERS = {
  basic: {
    name: "Basic",
    maxAgents: 1,
    memoryLimitMb: 2048,
    cpuLimit: "1.0",
    priceNanoton: "5000000000",
    priceTon: 5,
  },
  pro: {
    name: "Pro",
    maxAgents: 3,
    memoryLimitMb: 3072,
    cpuLimit: "1.5",
    priceNanoton: "12000000000",
    priceTon: 12,
  },
  enterprise: {
    name: "Enterprise",
    maxAgents: 10,
    memoryLimitMb: 4096,
    cpuLimit: "2.0",
    priceNanoton: "30000000000",
    priceTon: 30,
  },
} as const;

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS;

export const OPENCLAW_DOCKER_IMAGE = "ghcr.io/alloeth/openclaw-host";
export const OPENCLAW_DOCKER_TAG = "latest";
export const OPENCLAW_GATEWAY_PORT = "18789";

export const AGENT_MAX_RESTART_ATTEMPTS = 3;
export const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const SUBSCRIPTION_GRACE_PERIOD_DAYS = 3;
