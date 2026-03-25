import { Injectable, Inject } from "@nestjs/common";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { DB, type Db } from "../db/db.module";
import { agents, subscriptions } from "../db/schema";
import { CoolifyService, type EnvVar } from "../coolify/coolify.service";
import { CryptoService } from "../crypto/crypto.service";

const OPENCLAW_DOCKER_IMAGE = "ghcr.io/alloeth/telehost-agent";
const OPENCLAW_DOCKER_TAG = "latest";
const OPENCLAW_GATEWAY_PORT = "18789";

const SUBSCRIPTION_TIERS = {
  basic: { maxAgents: 1, memoryLimitMb: 2048, cpuLimit: "1.0", priceNanoton: "5000000000", priceTon: 5 },
  pro: { maxAgents: 3, memoryLimitMb: 3072, cpuLimit: "1.5", priceNanoton: "12000000000", priceTon: 12 },
  enterprise: { maxAgents: 10, memoryLimitMb: 4096, cpuLimit: "2.0", priceNanoton: "30000000000", priceTon: 30 },
} as const;

type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS;

export interface OpenClawConfig {
  provider: string;
  apiKey: string;
  model: string;
  telegramBotToken?: string;
  discordBotToken?: string;
  slackBotToken?: string;
  slackAppToken?: string;
}

function nameToSlug(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function mapProvider(provider: string): string {
  const mapping: Record<string, string> = { anthropic: "anthropic", openai: "openai", google: "google", xai: "xai", groq: "groq", openrouter: "openrouter" };
  return mapping[provider] || provider;
}

function providerEnvKey(provider: string): string {
  const mapping: Record<string, string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", google: "GEMINI_API_KEY", xai: "ZAI_API_KEY", groq: "GROQ_API_KEY", openrouter: "OPENROUTER_API_KEY" };
  return mapping[provider] || "OPENAI_API_KEY";
}

function generateOpenClawConfig(config: OpenClawConfig): { configJson: string; gatewayToken: string } {
  const gatewayToken = randomBytes(32).toString("hex");
  const openclawConfig: Record<string, unknown> = {
    agents: { defaults: { model: { primary: `${mapProvider(config.provider)}/${config.model}` }, sandbox: { mode: "off" } } },
    gateway: { mode: "local", port: 18789, bind: "lan", auth: { mode: "token" }, controlUi: { enabled: false }, http: { endpoints: { chatCompletions: { enabled: true }, responses: { enabled: true } } } },
  };
  const channels: Record<string, unknown> = {};
  if (config.telegramBotToken) channels.telegram = { enabled: true, botToken: config.telegramBotToken };
  if (config.discordBotToken) channels.discord = { enabled: true, botToken: config.discordBotToken };
  if (config.slackBotToken && config.slackAppToken) channels.slack = { enabled: true, botToken: config.slackBotToken, appToken: config.slackAppToken };
  if (Object.keys(channels).length > 0) openclawConfig.channels = channels;
  return { configJson: JSON.stringify(openclawConfig, null, 2), gatewayToken };
}

@Injectable()
export class AgentsService {
  constructor(
    @Inject(DB) private db: Db,
    private coolify: CoolifyService,
    private crypto: CryptoService,
  ) {}

  async createAgent(userId: string, name: string, config: OpenClawConfig): Promise<string> {
    const sub = await this.db.select().from(subscriptions).where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active"))).limit(1);
    const hasActiveSub = sub.length > 0;
    const isDev = process.env.NODE_ENV === "development";

    if (!hasActiveSub && !isDev) {
      const existing = await this.db.select({ id: agents.id }).from(agents).where(eq(agents.userId, userId)).limit(1);
      if (existing.length > 0) throw new Error("Free trial is limited to 1 agent. Subscribe to deploy more.");
    }

    const slug = nameToSlug(name);
    if (!slug) throw new Error("Agent name must contain at least one letter or number");

    const existingSlug = await this.db.select({ id: agents.id }).from(agents).where(eq(agents.slug, slug)).limit(1);
    if (existingSlug.length > 0) throw new Error(`Name "${name}" is already taken. Choose a different name.`);

    const baseDomain = process.env.AGENT_BASE_DOMAIN;
    const routingDomain = baseDomain ? `https://${slug}.${baseDomain}` : undefined;

    const { configJson, gatewayToken } = generateOpenClawConfig(config);
    const configWithKey = JSON.parse(configJson);
    configWithKey._apiKey = config.apiKey;
    const encrypted = this.crypto.encrypt(JSON.stringify(configWithKey, null, 2));

    const trialEndsAt = hasActiveSub || isDev ? null : new Date(Date.now() + 60 * 60 * 1000);
    const tier: SubscriptionTier = sub.length > 0 ? (sub[0].tier as SubscriptionTier) : "basic";

    const [agent] = await this.db.insert(agents).values({
      userId, name, slug,
      status: "provisioning",
      webuiAuthToken: gatewayToken,
      configEncrypted: encrypted.ciphertext,
      configIv: encrypted.iv,
      configTag: encrypted.tag + ":" + encrypted.salt,
      trialEndsAt,
    }).returning();

    this.provisionAgent(agent.id, { slug, routingDomain, tier, configJson, gatewayToken, config }).catch((err) => {
      console.error(`[provision] Failed for agent ${agent.id}:`, err);
      this.db.update(agents).set({ status: "error", lastError: err instanceof Error ? err.message : "Provisioning failed", updatedAt: new Date() }).where(eq(agents.id, agent.id)).catch(console.error);
    });

    return agent.id;
  }

  private async provisionAgent(agentId: string, opts: { slug: string; routingDomain?: string; tier: SubscriptionTier; configJson: string; gatewayToken: string; config: OpenClawConfig }) {
    const tierConfig = SUBSCRIPTION_TIERS[opts.tier];
    const coolifyApp = await this.coolify.createApplication({
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
      health_check_enabled: true, health_check_path: "/healthz", health_check_port: OPENCLAW_GATEWAY_PORT,
      health_check_interval: 30, health_check_timeout: 10, health_check_retries: 3, health_check_start_period: 60,
    });

    await this.db.update(agents).set({ coolifyAppUuid: coolifyApp.uuid, updatedAt: new Date() }).where(eq(agents.id, agentId));

    // Wait for Coolify to index
    for (let i = 0; i < 30; i++) {
      try { await this.coolify.getApplication(coolifyApp.uuid); break; } catch { await new Promise((r) => setTimeout(r, 2000)); }
    }

    await this.coolify.addPersistentVolume(coolifyApp.uuid, "/home/node/.openclaw");

    const syncUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
    const configB64 = Buffer.from(opts.configJson).toString("base64");
    const envVars: EnvVar[] = [
      { key: "NODE_ENV", value: "production", is_build_time: false },
      { key: "OPENCLAW_GATEWAY_BIND", value: "lan", is_build_time: false },
      { key: "OPENCLAW_CONFIG_B64", value: configB64, is_build_time: false },
      { key: "OPENCLAW_GATEWAY_TOKEN", value: opts.gatewayToken, is_build_time: false },
      { key: providerEnvKey(opts.config.provider), value: opts.config.apiKey, is_build_time: false },
      { key: "TELEHOST_SYNC_URL", value: syncUrl, is_build_time: false },
      { key: "TELEHOST_AGENT_ID", value: agentId, is_build_time: false },
      { key: "TELEHOST_SYNC_TOKEN", value: opts.gatewayToken, is_build_time: false },
    ];
    await this.coolify.bulkSetEnvVars(coolifyApp.uuid, envVars);
    await this.coolify.startApplication(coolifyApp.uuid);
    await this.db.update(agents).set({ status: "starting", updatedAt: new Date() }).where(eq(agents.id, agentId));
  }

  async updateAgentEnvVars(agentId: string) {
    const agent = await this.getAgentOrThrow(agentId);
    if (!agent.coolifyAppUuid) return;

    let configB64 = "", provider = "", apiKey = "";
    if (agent.configEncrypted && agent.configIv && agent.configTag) {
      const [tag, salt] = agent.configTag.split(":");
      const configJson = this.crypto.decrypt({ ciphertext: agent.configEncrypted, iv: agent.configIv, tag, salt });
      try {
        const parsed = JSON.parse(configJson);
        apiKey = parsed._apiKey || "";
        const modelStr = parsed.agents?.defaults?.model?.primary || "";
        provider = modelStr.split("/")[0] || "";
        delete parsed._apiKey;
        const storedGw = parsed.gateway || {};
        parsed.gateway = { ...storedGw, mode: "local", port: storedGw.port || 18789, bind: storedGw.bind || "lan", auth: { mode: "token" }, controlUi: { enabled: false }, http: { endpoints: { chatCompletions: { enabled: true }, responses: { enabled: true } } } };
        configB64 = Buffer.from(JSON.stringify(parsed)).toString("base64");
      } catch { configB64 = Buffer.from(configJson).toString("base64"); }
    }

    const syncUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
    const envVars: EnvVar[] = [
      { key: "NODE_ENV", value: "production", is_build_time: false },
      { key: "OPENCLAW_GATEWAY_BIND", value: "lan", is_build_time: false },
      { key: "OPENCLAW_CONFIG_B64", value: configB64, is_build_time: false },
      { key: "OPENCLAW_GATEWAY_TOKEN", value: agent.webuiAuthToken || "", is_build_time: false },
      { key: providerEnvKey(provider), value: apiKey, is_build_time: false },
      { key: "TELEHOST_SYNC_URL", value: syncUrl, is_build_time: false },
      { key: "TELEHOST_AGENT_ID", value: agent.id, is_build_time: false },
      { key: "TELEHOST_SYNC_TOKEN", value: agent.webuiAuthToken || "", is_build_time: false },
    ];
    await this.coolify.bulkSetEnvVars(agent.coolifyAppUuid, envVars);
  }

  async startAgent(agentId: string) {
    const agent = await this.getAgentOrThrow(agentId);
    if (!agent.coolifyAppUuid) throw new Error("Agent has no Coolify application");
    await this.coolify.startApplication(agent.coolifyAppUuid);
    await this.db.update(agents).set({ status: "starting", updatedAt: new Date() }).where(eq(agents.id, agentId));
  }

  async stopAgent(agentId: string) {
    const agent = await this.getAgentOrThrow(agentId);
    if (!agent.coolifyAppUuid) throw new Error("Agent has no Coolify application");
    await this.db.update(agents).set({ status: "stopping", updatedAt: new Date() }).where(eq(agents.id, agentId));
    await this.coolify.stopApplication(agent.coolifyAppUuid);
    await this.coolify.waitForApplicationStopped(agent.coolifyAppUuid);
    await this.db.update(agents).set({ status: "stopped", stoppedAt: new Date(), updatedAt: new Date() }).where(eq(agents.id, agentId));
  }

  async restartAgent(agentId: string) {
    const agent = await this.getAgentOrThrow(agentId);
    if (!agent.coolifyAppUuid) throw new Error("Agent has no Coolify application");
    await this.db.update(agents).set({ status: "restarting", updatedAt: new Date() }).where(eq(agents.id, agentId));
    await this.coolify.stopApplication(agent.coolifyAppUuid);
    await this.coolify.waitForApplicationStopped(agent.coolifyAppUuid);
    await this.coolify.startApplication(agent.coolifyAppUuid);
    await this.db.update(agents).set({ status: "starting", updatedAt: new Date() }).where(eq(agents.id, agentId));
  }

  async redeployAgent(agentId: string) {
    const agent = await this.getAgentOrThrow(agentId);
    if (!agent.coolifyAppUuid) throw new Error("Agent has no Coolify application");
    await this.db.update(agents).set({ status: "deploying", updatedAt: new Date() }).where(eq(agents.id, agentId));
    await this.coolify.stopApplication(agent.coolifyAppUuid);
    await this.coolify.waitForApplicationStopped(agent.coolifyAppUuid);
    await this.updateAgentEnvVars(agentId);
    await this.coolify.startApplication(agent.coolifyAppUuid);
    await this.db.update(agents).set({ status: "starting", updatedAt: new Date() }).where(eq(agents.id, agentId));
  }

  async deleteAgent(agentId: string) {
    const agent = await this.getAgentOrThrow(agentId);
    await this.db.update(agents).set({ status: "deleting", updatedAt: new Date() }).where(eq(agents.id, agentId));
    if (agent.coolifyAppUuid) {
      try { await this.coolify.deleteApplication(agent.coolifyAppUuid); } catch { /* may already be gone */ }
    }
    await this.db.delete(agents).where(eq(agents.id, agentId));
  }

  async getAgentOrThrow(agentId: string) {
    const results = await this.db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
    if (results.length === 0) throw new Error("Agent not found");
    return results[0];
  }

  async syncAgentStatus(agent: { id: string; status: string; coolifyAppUuid: string | null }) {
    if (!agent.coolifyAppUuid) return null;
    const protectedStates = ["provisioning", "deleting", "stopping", "restarting"];
    if (protectedStates.includes(agent.status)) return null;

    try {
      const [app, deployment] = await Promise.all([
        this.coolify.getApplication(agent.coolifyAppUuid),
        this.coolify.getLatestDeployment(agent.coolifyAppUuid).catch(() => null),
      ]);
      const rawStatus = app.status ? String(app.status) : null;
      const isDeploying = deployment?.status === "queued" || deployment?.status === "in_progress";

      let mappedStatus = agent.status;
      let health: string | null = null;
      let errorDetail: string | null = null;

      if (isDeploying) { mappedStatus = "deploying"; }
      else if (rawStatus) {
        const parts = rawStatus.toLowerCase().trim().split(":");
        const cs = parts[0];
        health = parts.length > 1 ? parts[1] : null;
        if (cs === "running") { mappedStatus = "running"; errorDetail = health === "unhealthy" ? "Container running but health check failing" : null; }
        else if (cs === "exited" || cs === "stopped") { mappedStatus = "stopped"; health = null; }
        else if (cs === "restarting" || cs === "starting") { mappedStatus = "starting"; }
        else if (cs === "degraded") { mappedStatus = "error"; errorDetail = "Service is degraded"; }
        else if (cs === "error" || cs === "removing") { mappedStatus = "error"; errorDetail = `Container status: ${rawStatus}`; }

        if (deployment?.status === "failed" && mappedStatus !== "running") { mappedStatus = "error"; errorDetail = "Deployment failed"; }
      }

      const updates: Record<string, unknown> = { lastHealthCheck: new Date(), updatedAt: new Date() };
      if (mappedStatus !== agent.status) updates.status = mappedStatus;
      if (errorDetail) updates.lastError = errorDetail;
      else updates.lastError = null;

      await this.db.update(agents).set(updates).where(eq(agents.id, agent.id));
      return { status: mappedStatus, health, errorDetail };
    } catch { return null; }
  }

  nameToSlug = nameToSlug;
  generateOpenClawConfig = generateOpenClawConfig;
  static SUBSCRIPTION_TIERS = SUBSCRIPTION_TIERS;
}
