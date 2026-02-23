import { db } from "@/lib/db";
import { agents, subscriptions } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { encrypt, type EncryptedData } from "@/lib/crypto";
import {
  getCoolifyClient,
  type CreateDockerImageAppParams,
} from "@/lib/coolify/client";
import {
  generateConfigYaml,
  type AgentConfig,
} from "@/lib/agents/config-generator";
import {
  TELETON_DOCKER_IMAGE,
  TELETON_DOCKER_TAG,
  TELETON_WEBUI_PORT,
  SUBSCRIPTION_TIERS,
  type SubscriptionTier,
} from "@/lib/constants";

export interface CreateAgentInput {
  userId: string;
  name: string;
  config: AgentConfig;
}

export async function createAgent(input: CreateAgentInput): Promise<string> {
  const { userId, name, config } = input;

  // 1. Validate subscription capacity
  const sub = await db
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")),
    )
    .limit(1);

  const maxAgents = sub.length > 0 ? sub[0].maxAgents : 1;

  const agentCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(agents)
    .where(eq(agents.userId, userId));

  const currentAgents = Number(agentCountResult[0]?.count ?? 0);
  if (currentAgents >= maxAgents) {
    throw new Error(
      `Agent limit reached (${currentAgents}/${maxAgents}). Upgrade your subscription.`,
    );
  }

  // 2. Generate config.yaml and encrypt it
  const configYaml = generateConfigYaml(config);
  const encryptedConfig = encrypt(configYaml);

  // 3. Create agent record in DB
  const [agent] = await db
    .insert(agents)
    .values({
      userId,
      name,
      status: "provisioning",
      configEncrypted: encryptedConfig.ciphertext,
      configIv: encryptedConfig.iv,
      configTag: encryptedConfig.tag + ":" + encryptedConfig.salt,
    })
    .returning();

  // 4. Determine resource limits from subscription tier
  const tier: SubscriptionTier =
    sub.length > 0 ? (sub[0].tier as SubscriptionTier) : "free";
  const tierConfig = SUBSCRIPTION_TIERS[tier];

  // 5. Create Coolify application
  const coolify = getCoolifyClient();
  const configB64 = Buffer.from(configYaml).toString("base64");

  const appParams: CreateDockerImageAppParams = {
    name: `teleton-${agent.id.slice(0, 8)}`,
    docker_registry_image_name: TELETON_DOCKER_IMAGE,
    docker_registry_image_tag: TELETON_DOCKER_TAG,
    ports_exposes: TELETON_WEBUI_PORT,
    project_uuid: process.env.COOLIFY_PROJECT_UUID!,
    server_uuid: process.env.COOLIFY_SERVER_UUID!,
    environment_name: process.env.COOLIFY_ENVIRONMENT_NAME || "production",
    instant_deploy: false,
    custom_docker_run_options: `--volume teleton-data-${agent.id}:/data`,
    limits_memory: `${tierConfig.memoryLimitMb}M`,
    limits_cpus: tierConfig.cpuLimit,
  };

  const coolifyApp = await coolify.createDockerImageApp(appParams);

  // 6. Set environment variables
  await coolify.bulkSetEnvVars(coolifyApp.uuid, [
    {
      key: "TELETON_HOME",
      value: "/data",
      is_literal: true,
      is_shown_once: false,
    },
    {
      key: "TELETON_CONFIG_B64",
      value: configB64,
      is_literal: true,
      is_shown_once: true,
    },
    {
      key: "NODE_ENV",
      value: "production",
      is_literal: true,
      is_shown_once: false,
    },
  ]);

  // 7. Set pre-deployment command to decode config into /data
  const preDeployCmd = [
    'mkdir -p /data',
    'echo "$TELETON_CONFIG_B64" | base64 -d > /data/config.yaml',
    'if [ -n "$TELETON_SESSION_B64" ]; then echo "$TELETON_SESSION_B64" | base64 -d > /data/telegram_session.txt; fi',
  ].join(" && ");

  await coolify.updateApp(coolifyApp.uuid, {
    pre_deployment_command: preDeployCmd,
    pre_deployment_command_container: "main",
  });

  // 8. Update agent record with Coolify UUID
  await db
    .update(agents)
    .set({
      coolifyAppUuid: coolifyApp.uuid,
      status: "awaiting_session",
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agent.id));

  return agent.id;
}

export async function startAgent(agentId: string): Promise<void> {
  const agent = await getAgentOrThrow(agentId);
  const coolify = getCoolifyClient();
  await coolify.startApp(agent.coolifyAppUuid!);
  await db
    .update(agents)
    .set({ status: "starting", updatedAt: new Date() })
    .where(eq(agents.id, agentId));
}

export async function stopAgent(agentId: string): Promise<void> {
  const agent = await getAgentOrThrow(agentId);
  const coolify = getCoolifyClient();
  await coolify.stopApp(agent.coolifyAppUuid!);
  await db
    .update(agents)
    .set({ status: "stopped", stoppedAt: new Date(), updatedAt: new Date() })
    .where(eq(agents.id, agentId));
}

export async function restartAgent(agentId: string): Promise<void> {
  const agent = await getAgentOrThrow(agentId);
  const coolify = getCoolifyClient();
  await coolify.restartApp(agent.coolifyAppUuid!);
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
      await coolify.deleteApp(agent.coolifyAppUuid);
    } catch {
      // App may already be deleted
    }
  }

  await db.delete(agents).where(eq(agents.id, agentId));
}

export async function getAgentLogs(
  agentId: string,
  tail?: number,
): Promise<string> {
  const agent = await getAgentOrThrow(agentId);
  if (!agent.coolifyAppUuid) {
    throw new Error("Agent has no Coolify application");
  }
  const coolify = getCoolifyClient();
  return coolify.getAppLogs(agent.coolifyAppUuid, { tail: tail ?? 100 });
}

export async function injectTelegramSession(
  agentId: string,
  sessionString: string,
): Promise<void> {
  const agent = await getAgentOrThrow(agentId);
  if (!agent.coolifyAppUuid) {
    throw new Error("Agent has no Coolify application");
  }

  // Encrypt session for DB storage
  const encryptedSession = encrypt(sessionString);

  // Store encrypted session in DB
  await db
    .update(agents)
    .set({
      telegramSessionEncrypted: encryptedSession.ciphertext,
      telegramSessionIv: encryptedSession.iv,
      telegramSessionTag:
        encryptedSession.tag + ":" + encryptedSession.salt,
      telegramSessionStatus: "active",
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId));

  // Inject session into container via Coolify env var
  const sessionB64 = Buffer.from(sessionString).toString("base64");
  const coolify = getCoolifyClient();
  await coolify.setEnvVar(agent.coolifyAppUuid, {
    key: "TELETON_SESSION_B64",
    value: sessionB64,
    is_literal: true,
    is_shown_once: true,
  });
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
