import { db } from "@/lib/db";
import { agents, subscriptions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/crypto";
import { getCoolifyClient, type EnvVar } from "@/lib/coolify/client";
import {
  generateOpenClawConfig,
  providerEnvKey,
  type OpenClawConfig,
} from "@/lib/agents/config-generator";
import {
  OPENCLAW_DOCKER_IMAGE,
  OPENCLAW_DOCKER_TAG,
  OPENCLAW_GATEWAY_PORT,
  SUBSCRIPTION_TIERS,
  type SubscriptionTier,
} from "@/lib/constants";
import { nameToSlug } from "@/lib/agents/slug";
import { addPersistentVolume } from "@/lib/coolify/volumes";

// Build env vars array for Coolify bulk endpoint.
function buildEnvVars(opts: {
  agentId: string;
  syncToken: string;
  gatewayToken: string;
  configB64?: string;
  provider: string;
  apiKey: string;
}): EnvVar[] {
  const syncUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
  return [
    { key: "NODE_ENV", value: "production", is_build_time: false },
    { key: "OPENCLAW_GATEWAY_BIND", value: "lan", is_build_time: false },
    { key: "OPENCLAW_CONFIG_B64", value: opts.configB64 || "", is_build_time: false },
    { key: "OPENCLAW_GATEWAY_TOKEN", value: opts.gatewayToken, is_build_time: false },
    { key: providerEnvKey(opts.provider), value: opts.apiKey, is_build_time: false },
    { key: "TELEHOST_SYNC_URL", value: syncUrl, is_build_time: false },
    { key: "TELEHOST_AGENT_ID", value: opts.agentId, is_build_time: false },
    { key: "TELEHOST_SYNC_TOKEN", value: opts.syncToken, is_build_time: false },
  ];
}

// Update env vars on Coolify application from DB data.
export async function updateAgentEnvVars(agentId: string): Promise<void> {
  const agent = await getAgentOrThrow(agentId);
  if (!agent.coolifyAppUuid) return;

  let configB64 = "";
  let provider = "";
  let apiKey = "";

  if (agent.configEncrypted && agent.configIv && agent.configTag) {
    const [tag, salt] = agent.configTag.split(":");
    const configJson = decrypt({ ciphertext: agent.configEncrypted, iv: agent.configIv, tag, salt });

    try {
      const parsed = JSON.parse(configJson);
      apiKey = parsed._apiKey || "";
      // Extract provider from model string like "anthropic/claude-opus-4-6"
      const modelStr = parsed.agents?.defaults?.model?.primary || "";
      provider = modelStr.split("/")[0] || "";
      // Strip internal fields before sending to container
      delete parsed._apiKey;
      // Ensure gateway defaults are present (covers configs stored before these fields existed)
      const storedGw = parsed.gateway || {};
      parsed.gateway = {
        ...storedGw,
        mode: "local",
        port: storedGw.port || 18789,
        bind: storedGw.bind || "lan",
        auth: { mode: "token" },
        controlUi: { enabled: false },
        http: {
          endpoints: {
            chatCompletions: { enabled: true },
            responses: { enabled: true },
          },
        },
      };
      configB64 = Buffer.from(JSON.stringify(parsed)).toString("base64");
    } catch {
      configB64 = Buffer.from(configJson).toString("base64");
    }
  }

  const envVars = buildEnvVars({
    agentId: agent.id,
    syncToken: agent.webuiAuthToken || "",
    gatewayToken: agent.webuiAuthToken || "",
    configB64,
    provider,
    apiKey,
  });
  const coolify = getCoolifyClient();
  await coolify.bulkSetEnvVars(agent.coolifyAppUuid, envVars);
}

export interface CreateAgentInput {
  userId: string;
  name: string;
  config: OpenClawConfig;
}

/**
 * Create agent record in DB and kick off async provisioning.
 * Returns the agent ID immediately so the UI can redirect.
 */
export async function createAgent(input: CreateAgentInput): Promise<string> {
  const { userId, name, config } = input;
  console.log("[createAgent] START", { userId, name });

  // 1. Validate subscription capacity
  const sub = await db
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")),
    )
    .limit(1);

  console.log("[createAgent] sub query done", sub.length);
  const hasActiveSubscription = sub.length > 0;
  const isDev = process.env.NODE_ENV === "development";

  if (!hasActiveSubscription && !isDev) {
    const existingAgents = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.userId, userId))
      .limit(1);

    if (existingAgents.length > 0) {
      throw new Error(
        "Free trial is limited to 1 agent. Subscribe to deploy more.",
      );
    }
  }

  // 2. Generate slug and check uniqueness
  const slug = nameToSlug(name);
  if (!slug) {
    throw new Error("Agent name must contain at least one letter or number");
  }

  const existingSlug = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.slug, slug))
    .limit(1);

  if (existingSlug.length > 0) {
    throw new Error(`Name "${name}" is already taken. Choose a different name.`);
  }

  // Coolify domain for internal reverse-proxy routing (never exposed to users)
  const baseDomain = process.env.AGENT_BASE_DOMAIN;
  const routingDomain = baseDomain ? `https://${slug}.${baseDomain}` : undefined;

  // 3. Generate OpenClaw config and encrypt it
  const { configJson, gatewayToken } = generateOpenClawConfig(config);

  const configWithKey = JSON.parse(configJson);
  configWithKey._apiKey = config.apiKey;
  const configToStore = JSON.stringify(configWithKey, null, 2);

  const encryptedConfig = encrypt(configToStore);

  // 4. Create agent record in DB
  const trialEndsAt = hasActiveSubscription || isDev
    ? null
    : new Date(Date.now() + 60 * 60 * 1000);

  const tier: SubscriptionTier =
    sub.length > 0 ? (sub[0].tier as SubscriptionTier) : "basic";

  const [agent] = await db
    .insert(agents)
    .values({
      userId,
      name,
      slug,
      status: "provisioning",
      webuiAuthToken: gatewayToken,
      configEncrypted: encryptedConfig.ciphertext,
      configIv: encryptedConfig.iv,
      configTag: encryptedConfig.tag + ":" + encryptedConfig.salt,
      trialEndsAt,
    })
    .returning();

  console.log("[createAgent] DB insert done, agentId:", agent.id);

  // 5. Kick off async provisioning (don't await — return immediately)
  provisionAgent(agent.id, {
    slug,
    routingDomain,
    tier,
    configJson,
    gatewayToken,
    config,
  }).catch((err) => {
    console.error(`[provision] Failed for agent ${agent.id}:`, err);
    db.update(agents)
      .set({
        status: "error",
        lastError: err instanceof Error ? err.message : "Provisioning failed",
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agent.id))
      .catch(console.error);
  });

  console.log("[createAgent] returning agentId:", agent.id);
  return agent.id;
}

/** Async provisioning: creates Coolify app, sets env vars, starts container */
async function provisionAgent(
  agentId: string,
  opts: {
    slug: string;
    routingDomain: string | undefined;
    tier: SubscriptionTier;
    configJson: string;
    gatewayToken: string;
    config: OpenClawConfig;
  },
): Promise<void> {
  const tierConfig = SUBSCRIPTION_TIERS[opts.tier];
  const coolify = getCoolifyClient();

  // Create Coolify Docker Image application
  const coolifyApp = await coolify.createApplication({
    project_uuid: process.env.COOLIFY_PROJECT_UUID!,
    server_uuid: process.env.COOLIFY_SERVER_UUID!,
    environment_name: process.env.COOLIFY_ENVIRONMENT_NAME || "production",
    destination_uuid: process.env.COOLIFY_DESTINATION_UUID!,
    docker_registry_image_name: OPENCLAW_DOCKER_IMAGE,
    docker_registry_image_tag: OPENCLAW_DOCKER_TAG,
    ports_exposes: OPENCLAW_GATEWAY_PORT,
    name: opts.slug,
    domains: opts.routingDomain,
    instant_deploy: false,
    limits_memory: `${tierConfig.memoryLimitMb}M`,
    limits_cpus: tierConfig.cpuLimit,
    health_check_enabled: true,
    health_check_path: "/healthz",
    health_check_port: OPENCLAW_GATEWAY_PORT,
    health_check_interval: 30,
    health_check_timeout: 10,
    health_check_retries: 3,
    health_check_start_period: 60,
  });

  // Save Coolify UUID
  await db
    .update(agents)
    .set({ coolifyAppUuid: coolifyApp.uuid, updatedAt: new Date() })
    .where(eq(agents.id, agentId));

  // Wait for Coolify to index the app
  await waitForCoolifyApp(coolify, coolifyApp.uuid);

  // Add persistent volume
  await addPersistentVolume({
    appUuid: coolifyApp.uuid,
    mountPath: "/home/node/.openclaw",
  });

  // Set env vars
  const configB64 = Buffer.from(opts.configJson).toString("base64");
  const envVars = buildEnvVars({
    agentId,
    syncToken: opts.gatewayToken,
    gatewayToken: opts.gatewayToken,
    configB64,
    provider: opts.config.provider,
    apiKey: opts.config.apiKey,
  });
  await coolify.bulkSetEnvVars(coolifyApp.uuid, envVars);

  // Start the container
  await coolify.startApplication(coolifyApp.uuid);
  await db
    .update(agents)
    .set({ status: "starting", updatedAt: new Date() })
    .where(eq(agents.id, agentId));
}

export async function startAgent(agentId: string): Promise<void> {
  const agent = await getAgentOrThrow(agentId);
  if (!agent.coolifyAppUuid) {
    throw new Error("Agent has no Coolify application - try recreating it");
  }
  const coolify = getCoolifyClient();
  await coolify.startApplication(agent.coolifyAppUuid);
  await db
    .update(agents)
    .set({ status: "starting", updatedAt: new Date() })
    .where(eq(agents.id, agentId));
}

export async function stopAgent(agentId: string): Promise<void> {
  const agent = await getAgentOrThrow(agentId);
  if (!agent.coolifyAppUuid) {
    throw new Error("Agent has no Coolify application");
  }
  await db
    .update(agents)
    .set({ status: "stopping", updatedAt: new Date() })
    .where(eq(agents.id, agentId));
  const coolify = getCoolifyClient();
  await coolify.stopApplication(agent.coolifyAppUuid);
  await coolify.waitForApplicationStopped(agent.coolifyAppUuid);
  await db
    .update(agents)
    .set({ status: "stopped", stoppedAt: new Date(), updatedAt: new Date() })
    .where(eq(agents.id, agentId));
}

export async function restartAgent(agentId: string): Promise<void> {
  const agent = await getAgentOrThrow(agentId);
  if (!agent.coolifyAppUuid) {
    throw new Error("Agent has no Coolify application");
  }
  await db
    .update(agents)
    .set({ status: "restarting", updatedAt: new Date() })
    .where(eq(agents.id, agentId));
  const coolify = getCoolifyClient();
  await coolify.stopApplication(agent.coolifyAppUuid);
  await coolify.waitForApplicationStopped(agent.coolifyAppUuid);
  await coolify.startApplication(agent.coolifyAppUuid);
  await db
    .update(agents)
    .set({ status: "starting", updatedAt: new Date() })
    .where(eq(agents.id, agentId));
}

export async function redeployAgent(agentId: string): Promise<void> {
  const agent = await getAgentOrThrow(agentId);
  if (!agent.coolifyAppUuid) {
    throw new Error("Agent has no Coolify application");
  }
  await db
    .update(agents)
    .set({ status: "deploying", updatedAt: new Date() })
    .where(eq(agents.id, agentId));
  const coolify = getCoolifyClient();
  await coolify.stopApplication(agent.coolifyAppUuid);
  await coolify.waitForApplicationStopped(agent.coolifyAppUuid);
  await updateAgentEnvVars(agentId);
  await coolify.startApplication(agent.coolifyAppUuid);
  await db
    .update(agents)
    .set({ status: "starting", updatedAt: new Date() })
    .where(eq(agents.id, agentId));
}

export async function deleteAgent(agentId: string): Promise<void> {
  const agent = await getAgentOrThrow(agentId);

  await db
    .update(agents)
    .set({ status: "deleting", updatedAt: new Date() })
    .where(eq(agents.id, agentId));

  if (agent.coolifyAppUuid) {
    const coolify = getCoolifyClient();
    try {
      await coolify.deleteApplication(agent.coolifyAppUuid);
    } catch (err) {
      console.error(`Failed to delete Coolify application ${agent.coolifyAppUuid}:`, err);
    }
  }

  await db.delete(agents).where(eq(agents.id, agentId));
}

export async function getAgentLogs(
  agentId: string,
  tail: number = 100,
): Promise<string> {
  const agent = await getAgentOrThrow(agentId);
  if (!agent.coolifyAppUuid) {
    throw new Error("Agent has no Coolify application");
  }

  const coolify = getCoolifyClient();
  return coolify.getApplicationLogs(agent.coolifyAppUuid, tail);
}

async function getAgentOrThrow(agentId: string) {
  const results = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (results.length === 0) {
    throw new Error("Agent not found");
  }
  return results[0];
}

async function waitForCoolifyApp(
  coolify: ReturnType<typeof getCoolifyClient>,
  uuid: string,
  maxRetries = 30,
  delayMs = 2000,
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await coolify.getApplication(uuid);
      return;
    } catch (err) {
      if (i === maxRetries - 1) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Coolify application ${uuid} not ready after ${maxRetries} retries (${detail})`,
        );
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
