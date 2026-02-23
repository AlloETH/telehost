import { db } from "@/lib/db";
import { agents, subscriptions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { encrypt } from "@/lib/crypto";
import { generateWallet } from "@/lib/ton/wallet";
import { getCoolifyClient } from "@/lib/coolify/client";
import {
  generateConfigWithToken,
  type AgentConfig,
} from "@/lib/agents/config-generator";
import {
  TELETON_DOCKER_IMAGE,
  TELETON_DOCKER_TAG,
  TELETON_WEBUI_PORT,
  SUBSCRIPTION_TIERS,
  type SubscriptionTier,
} from "@/lib/constants";
import { nameToSlug } from "@/lib/agents/slug";

export interface CreateAgentInput {
  userId: string;
  name: string;
  config: AgentConfig;
  telegramSessionString?: string;
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

  // TODO: re-enable subscription limits after testing
  // const maxAgents = sub.length > 0 ? sub[0].maxAgents : 1;
  // const agentCountResult = await db
  //   .select({ count: sql<number>`count(*)` })
  //   .from(agents)
  //   .where(eq(agents.userId, userId));
  // const currentAgents = Number(agentCountResult[0]?.count ?? 0);
  // if (currentAgents >= maxAgents) {
  //   throw new Error(
  //     `Agent limit reached (${currentAgents}/${maxAgents}). Upgrade your subscription.`,
  //   );
  // }

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

  const baseDomain = process.env.AGENT_BASE_DOMAIN;
  const agentDomain = baseDomain ? `https://${slug}.${baseDomain}` : undefined;

  // 3. Generate config.yaml and encrypt it
  const { yaml: configYaml, authToken } = generateConfigWithToken(config);
  const encryptedConfig = encrypt(configYaml);

  // 4. Create agent record in DB
  const [agent] = await db
    .insert(agents)
    .values({
      userId,
      name,
      slug,
      status: "provisioning",
      coolifyDomain: agentDomain || null,
      webuiAuthToken: authToken,
      configEncrypted: encryptedConfig.ciphertext,
      configIv: encryptedConfig.iv,
      configTag: encryptedConfig.tag + ":" + encryptedConfig.salt,
    })
    .returning();

  // 5. Determine resource limits from subscription tier
  const tier: SubscriptionTier =
    sub.length > 0 ? (sub[0].tier as SubscriptionTier) : "basic";
  const tierConfig = SUBSCRIPTION_TIERS[tier];

  // 6. Create Coolify application via Docker Compose (for persistent volume support)
  const coolify = getCoolifyClient();
  const configB64 = Buffer.from(configYaml).toString("base64");

  const composeYaml = [
    "services:",
    "  agent:",
    `    image: ${TELETON_DOCKER_IMAGE}:${TELETON_DOCKER_TAG}`,
    "    volumes:",
    `      - teleton-data:/data`,
    "    ports:",
    `      - "${TELETON_WEBUI_PORT}:${TELETON_WEBUI_PORT}"`,
    "    environment:",
    "      - TELETON_HOME=/data",
    "      - NODE_ENV=production",
    "      - TELETON_CONFIG_B64=${TELETON_CONFIG_B64:-}",
    "      - TELETON_SESSION_B64=${TELETON_SESSION_B64:-}",
    "      - TELETON_WALLET_B64=${TELETON_WALLET_B64:-}",
    "    deploy:",
    "      resources:",
    "        limits:",
    `          memory: ${tierConfig.memoryLimitMb}M`,
    `          cpus: '${tierConfig.cpuLimit}'`,
    "volumes:",
    "  teleton-data:",
  ].join("\n");

  const coolifyApp = await coolify.createDockerComposeApp({
    project_uuid: process.env.COOLIFY_PROJECT_UUID!,
    server_uuid: process.env.COOLIFY_SERVER_UUID!,
    environment_name: process.env.COOLIFY_ENVIRONMENT_NAME || "production",
    docker_compose_raw: Buffer.from(composeYaml).toString("base64"),
    name: slug,
    instant_deploy: false,
  });

  // Save Coolify UUID immediately so cleanup works even if later steps fail
  await db
    .update(agents)
    .set({ coolifyAppUuid: coolifyApp.uuid, updatedAt: new Date() })
    .where(eq(agents.id, agent.id));

  // Wait for Coolify to fully index the new application before proceeding
  await waitForCoolifyApp(coolify, coolifyApp.uuid);

  // 6b. Set the domain for the compose service
  if (agentDomain) {
    await coolify.updateApp(coolifyApp.uuid, {
      docker_compose_domains: [
        { name: "agent", domain: agentDomain },
      ],
    });
  }

  // 7. Generate TON wallet
  const wallet = await generateWallet();
  const walletJson = JSON.stringify(wallet, null, 2);
  const walletB64 = Buffer.from(walletJson).toString("base64");

  // Store encrypted mnemonic in DB
  const encryptedMnemonic = encrypt(wallet.mnemonic.join(" "));
  await db
    .update(agents)
    .set({
      walletAddress: wallet.address,
      walletMnemonicEncrypted: encryptedMnemonic.ciphertext,
      walletMnemonicIv: encryptedMnemonic.iv,
      walletMnemonicTag: encryptedMnemonic.tag + ":" + encryptedMnemonic.salt,
    })
    .where(eq(agents.id, agent.id));

  // 8. Set secret environment variables (non-secrets are in compose file)
  await coolify.bulkSetEnvVars(coolifyApp.uuid, [
    {
      key: "TELETON_CONFIG_B64",
      value: configB64,
      is_literal: true,
      is_shown_once: true,
    },
    {
      key: "TELETON_WALLET_B64",
      value: walletB64,
      is_literal: true,
      is_shown_once: true,
    },
  ]);

  // 9. Handle session string if provided (wizard flow)
  if (input.telegramSessionString) {
    const sessionB64 = Buffer.from(input.telegramSessionString).toString("base64");
    await coolify.setEnvVar(coolifyApp.uuid, {
      key: "TELETON_SESSION_B64",
      value: sessionB64,
      is_literal: true,
      is_shown_once: true,
    });

    const encryptedSession = encrypt(input.telegramSessionString);
    await db
      .update(agents)
      .set({
        telegramSessionEncrypted: encryptedSession.ciphertext,
        telegramSessionIv: encryptedSession.iv,
        telegramSessionTag: encryptedSession.tag + ":" + encryptedSession.salt,
        telegramSessionStatus: "active",
        status: "starting",
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agent.id));

    // Auto-deploy since session is ready
    await coolify.deployApp(coolifyApp.uuid);
  } else {
    await db
      .update(agents)
      .set({
        status: "awaiting_session",
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agent.id));
  }

  return agent.id;
}

export async function startAgent(agentId: string): Promise<void> {
  const agent = await getAgentOrThrow(agentId);
  if (!agent.coolifyAppUuid) {
    throw new Error("Agent has no Coolify application — try recreating it");
  }
  const coolify = getCoolifyClient();

  // Use deploy for first launch or after awaiting_session (never deployed before),
  // use start for previously stopped agents
  if (
    agent.status === "awaiting_session" ||
    agent.status === "provisioning" ||
    agent.status === "error"
  ) {
    await coolify.deployApp(agent.coolifyAppUuid);
  } else {
    await coolify.startApp(agent.coolifyAppUuid);
  }

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
  const coolify = getCoolifyClient();
  await coolify.stopApp(agent.coolifyAppUuid);
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
  const coolify = getCoolifyClient();
  await coolify.restartApp(agent.coolifyAppUuid);
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
  const coolify = getCoolifyClient();
  await coolify.deployApp(agent.coolifyAppUuid, true);
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
    } catch (err) {
      console.error(`Failed to delete Coolify app ${agent.coolifyAppUuid}:`, err);
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

async function waitForCoolifyApp(
  coolify: ReturnType<typeof getCoolifyClient>,
  uuid: string,
  maxRetries = 10,
  delayMs = 1500,
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await coolify.getApp(uuid);
      return;
    } catch {
      if (i === maxRetries - 1) {
        throw new Error(`Coolify app ${uuid} not ready after ${maxRetries} retries`);
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
