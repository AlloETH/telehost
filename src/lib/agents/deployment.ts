import { db } from "@/lib/db";
import { agents, subscriptions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/crypto";
import { generateWallet, reconstructWalletJson } from "@/lib/ton/wallet";
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

// Build Docker Compose YAML with actual env var values embedded directly.
function buildComposeYaml(opts: {
  configB64?: string;
  walletB64?: string;
  sessionB64?: string;
  memoryLimitMb: number;
  cpuLimit: string;
  domain?: string; // e.g. "https://slug.tokn.deal"
}): string {
  const lines = [
    "services:",
    "  agent:",
    `    image: ${TELETON_DOCKER_IMAGE}:${TELETON_DOCKER_TAG}`,
    "    volumes:",
    "      - teleton-data:/data",
    "    ports:",
    `      - "${TELETON_WEBUI_PORT}:${TELETON_WEBUI_PORT}"`,
  ];

  // Add Traefik labels for public domain access
  if (opts.domain) {
    const hostname = opts.domain.replace(/^https?:\/\//, "");
    lines.push(
      "    labels:",
      "      - traefik.enable=true",
      `      - "traefik.http.routers.agent.rule=Host(\`${hostname}\`)"`,
      "      - traefik.http.routers.agent.entryPoints=https",
      "      - traefik.http.routers.agent.tls=true",
      "      - traefik.http.routers.agent.tls.certresolver=letsencrypt",
      `      - traefik.http.services.agent.loadbalancer.server.port=${TELETON_WEBUI_PORT}`,
    );
  }

  lines.push(
    "    environment:",
    "      - TELETON_HOME=/data",
    "      - NODE_ENV=production",
    `      - TELETON_CONFIG_B64=${opts.configB64 || ""}`,
    `      - TELETON_SESSION_B64=${opts.sessionB64 || ""}`,
    `      - TELETON_WALLET_B64=${opts.walletB64 || ""}`,
    "    healthcheck:",
    `      test: ["CMD", "node", "-e", "fetch('http://localhost:${TELETON_WEBUI_PORT}/').then(r=>{process.exit(r.status<500?0:1)}).catch(()=>process.exit(1))"]`,
    "      interval: 30s",
    "      timeout: 10s",
    "      start_period: 40s",
    "      retries: 3",
    "    deploy:",
    "      resources:",
    "        limits:",
    `          memory: ${opts.memoryLimitMb}M`,
    `          cpus: '${opts.cpuLimit}'`,
    "volumes:",
    "  teleton-data:",
  );

  return lines.join("\n");
}

// Rebuild compose YAML from DB data and update it in Coolify.
// Pass overrides for values you already have to avoid unnecessary decryption.
export async function rebuildAndUpdateCompose(
  agentId: string,
  overrides?: {
    configB64?: string;
    sessionB64?: string;
    walletB64?: string;
  },
): Promise<void> {
  const agent = await getAgentOrThrow(agentId);
  if (!agent.coolifyAppUuid) return;

  // Determine resource limits from subscription tier
  const sub = await db
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.userId, agent.userId), eq(subscriptions.status, "active")),
    )
    .limit(1);
  const tier: SubscriptionTier =
    sub.length > 0 ? (sub[0].tier as SubscriptionTier) : "basic";
  const tierConfig = SUBSCRIPTION_TIERS[tier];

  // Reconstruct config B64
  let configB64 = overrides?.configB64;
  if (!configB64 && agent.configEncrypted && agent.configIv && agent.configTag) {
    const [tag, salt] = agent.configTag.split(":");
    const yaml = decrypt({ ciphertext: agent.configEncrypted, iv: agent.configIv, tag, salt });
    configB64 = Buffer.from(yaml).toString("base64");
  }

  // Reconstruct wallet B64
  let walletB64 = overrides?.walletB64;
  if (!walletB64 && agent.walletMnemonicEncrypted && agent.walletMnemonicIv && agent.walletMnemonicTag) {
    const [tag, salt] = agent.walletMnemonicTag.split(":");
    const mnemonicStr = decrypt({
      ciphertext: agent.walletMnemonicEncrypted,
      iv: agent.walletMnemonicIv,
      tag,
      salt,
    });
    const walletJson = await reconstructWalletJson(
      mnemonicStr.split(" "),
      agent.walletAddress || "",
      (agent.createdAt ?? new Date()).toISOString(),
    );
    walletB64 = Buffer.from(walletJson).toString("base64");
  }

  // Reconstruct session B64
  let sessionB64 = overrides?.sessionB64;
  if (!sessionB64 && agent.telegramSessionEncrypted && agent.telegramSessionIv && agent.telegramSessionTag) {
    const [tag, salt] = agent.telegramSessionTag.split(":");
    const session = decrypt({
      ciphertext: agent.telegramSessionEncrypted,
      iv: agent.telegramSessionIv,
      tag,
      salt,
    });
    sessionB64 = Buffer.from(session).toString("base64");
  }

  const composeYaml = buildComposeYaml({
    configB64,
    walletB64,
    sessionB64,
    memoryLimitMb: tierConfig.memoryLimitMb,
    cpuLimit: tierConfig.cpuLimit,
    domain: agent.coolifyDomain || undefined,
  });

  const coolify = getCoolifyClient();
  await coolify.updateService(agent.coolifyAppUuid, {
    docker_compose_raw: Buffer.from(composeYaml).toString("base64"),
  });
}

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

  // 6. Create Coolify service via Docker Compose (POST /services)
  const coolify = getCoolifyClient();
  const configB64 = Buffer.from(configYaml).toString("base64");

  const initialComposeYaml = buildComposeYaml({
    configB64,
    memoryLimitMb: tierConfig.memoryLimitMb,
    cpuLimit: tierConfig.cpuLimit,
    domain: agentDomain,
  });

  const coolifyService = await coolify.createService({
    project_uuid: process.env.COOLIFY_PROJECT_UUID!,
    server_uuid: process.env.COOLIFY_SERVER_UUID!,
    environment_name: process.env.COOLIFY_ENVIRONMENT_NAME || "production",
    docker_compose_raw: Buffer.from(initialComposeYaml).toString("base64"),
    name: slug,
    instant_deploy: false,
  });

  // Save Coolify UUID immediately so cleanup works even if later steps fail
  await db
    .update(agents)
    .set({ coolifyAppUuid: coolifyService.uuid, updatedAt: new Date() })
    .where(eq(agents.id, agent.id));

  // Wait for Coolify to fully index the new service
  await waitForCoolifyService(coolify, coolifyService.uuid);

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

  // 8. Handle session string if provided (wizard flow)
  let sessionB64: string | undefined;
  if (input.telegramSessionString) {
    sessionB64 = Buffer.from(input.telegramSessionString).toString("base64");

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
  } else {
    await db
      .update(agents)
      .set({
        status: "awaiting_session",
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agent.id));
  }

  // 9. Update compose with all B64 secrets embedded directly
  const finalComposeYaml = buildComposeYaml({
    configB64,
    walletB64,
    sessionB64,
    memoryLimitMb: tierConfig.memoryLimitMb,
    cpuLimit: tierConfig.cpuLimit,
    domain: agentDomain,
  });
  await coolify.updateService(coolifyService.uuid, {
    docker_compose_raw: Buffer.from(finalComposeYaml).toString("base64"),
  });

  // 10. Deploy if session is ready
  if (input.telegramSessionString) {
    await coolify.deployService(coolifyService.uuid);
  }

  return agent.id;
}

export async function startAgent(agentId: string): Promise<void> {
  const agent = await getAgentOrThrow(agentId);
  if (!agent.coolifyAppUuid) {
    throw new Error("Agent has no Coolify service — try recreating it");
  }
  const coolify = getCoolifyClient();
  await coolify.deployService(agent.coolifyAppUuid);
  await db
    .update(agents)
    .set({ status: "starting", updatedAt: new Date() })
    .where(eq(agents.id, agentId));
}

export async function stopAgent(agentId: string): Promise<void> {
  const agent = await getAgentOrThrow(agentId);
  if (!agent.coolifyAppUuid) {
    throw new Error("Agent has no Coolify service");
  }
  const coolify = getCoolifyClient();
  await coolify.stopService(agent.coolifyAppUuid);
  await db
    .update(agents)
    .set({ status: "stopped", stoppedAt: new Date(), updatedAt: new Date() })
    .where(eq(agents.id, agentId));
}

export async function restartAgent(agentId: string): Promise<void> {
  const agent = await getAgentOrThrow(agentId);
  if (!agent.coolifyAppUuid) {
    throw new Error("Agent has no Coolify service");
  }
  const coolify = getCoolifyClient();
  await coolify.restartService(agent.coolifyAppUuid);
  await db
    .update(agents)
    .set({ status: "starting", updatedAt: new Date() })
    .where(eq(agents.id, agentId));
}

export async function redeployAgent(agentId: string): Promise<void> {
  const agent = await getAgentOrThrow(agentId);
  if (!agent.coolifyAppUuid) {
    throw new Error("Agent has no Coolify service");
  }
  // Rebuild compose to ensure env vars are embedded directly
  await rebuildAndUpdateCompose(agentId);
  const coolify = getCoolifyClient();
  await coolify.deployService(agent.coolifyAppUuid);
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
      await coolify.deleteService(agent.coolifyAppUuid);
    } catch (err) {
      console.error(`Failed to delete Coolify service ${agent.coolifyAppUuid}:`, err);
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
    throw new Error("Agent has no Coolify service");
  }

  const coolify = getCoolifyClient();
  const service = await coolify.getService(agent.coolifyAppUuid);

  // Try getting logs from the first service application
  if (
    Array.isArray(service.applications) &&
    service.applications.length > 0
  ) {
    return coolify.getApplicationLogs(service.applications[0].uuid, tail);
  }

  return `Service ${agent.coolifyAppUuid} (status: ${service.status || "unknown"}) — no application containers found.`;
}

export async function injectTelegramSession(
  agentId: string,
  sessionString: string,
): Promise<void> {
  const agent = await getAgentOrThrow(agentId);
  if (!agent.coolifyAppUuid) {
    throw new Error("Agent has no Coolify service");
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

  // Rebuild compose with session embedded directly
  const sessionB64 = Buffer.from(sessionString).toString("base64");
  await rebuildAndUpdateCompose(agentId, { sessionB64 });
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

async function waitForCoolifyService(
  coolify: ReturnType<typeof getCoolifyClient>,
  uuid: string,
  maxRetries = 30,
  delayMs = 2000,
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await coolify.getService(uuid);
      return;
    } catch (err) {
      if (i === maxRetries - 1) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Coolify service ${uuid} not ready after ${maxRetries} retries (${detail})`,
        );
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
