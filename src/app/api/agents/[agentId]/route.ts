import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { deleteAgent, updateAgentEnvVars } from "@/lib/agents/deployment";
import { syncAgentFromCoolify } from "@/lib/agents/sync-status";
import { encrypt, decrypt } from "@/lib/crypto";
import {
  generateOpenClawConfig,
  type OpenClawConfig,
} from "@/lib/agents/config-generator";
import { nameToSlug } from "@/lib/agents/slug";
import { getCoolifyClient } from "@/lib/coolify/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await params;

  const results = await db
    .select({
      id: agents.id,
      name: agents.name,
      status: agents.status,
      coolifyAppUuid: agents.coolifyAppUuid,
      coolifyDomain: agents.coolifyDomain,
      webuiAuthToken: agents.webuiAuthToken,
      lastHealthCheck: agents.lastHealthCheck,
      lastError: agents.lastError,
      restartCount: agents.restartCount,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
      stoppedAt: agents.stoppedAt,
      trialEndsAt: agents.trialEndsAt,
      configEncrypted: agents.configEncrypted,
      configIv: agents.configIv,
      configTag: agents.configTag,
    })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
    .limit(1);

  if (results.length === 0) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const { configEncrypted, configIv, configTag, ...agentFields } = results[0];
  const agent = { ...agentFields } as Record<string, unknown>;

  // Sync real status from Coolify
  const synced = await syncAgentFromCoolify(agent as typeof agentFields);
  if (synced) {
    agent.status = synced.status;
    if (synced.coolifyDomain) agent.coolifyDomain = synced.coolifyDomain;
    if (synced.coolifyStatus) agent.coolifyStatus = synced.coolifyStatus;
    if (synced.health !== undefined) agent.healthStatus = synced.health;
    if (synced.lastError !== undefined) agent.lastError = synced.lastError;
  }

  // Decrypt config to expose editable settings
  try {
    const [tag, salt] = configTag.split(":");
    const configStr = decrypt({ ciphertext: configEncrypted, iv: configIv, tag, salt });
    const parsed = JSON.parse(configStr);

    agent.config = {
      provider: parsed.models?.default?.provider,
      apiKey: parsed._apiKey,
      model: parsed.models?.default?.model,
      telegramBotToken: parsed.channels?.telegram?.botToken,
      discordBotToken: parsed.channels?.discord?.botToken,
      slackBotToken: parsed.channels?.slack?.botToken,
      slackAppToken: parsed.channels?.slack?.appToken,
    };
  } catch {
    // Config decryption failed - don't expose config
  }

  return NextResponse.json({ agent });
}

// Config fields that can be updated via PATCH
const CONFIG_FIELDS = [
  "provider", "apiKey", "model",
  "telegramBotToken", "discordBotToken",
  "slackBotToken", "slackAppToken",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await params;
  const body = await req.json();

  const existing = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const agent = existing[0];
  const dbUpdates: Record<string, unknown> = { updatedAt: new Date() };
  let needsRedeploy = false;

  // Handle name change (+ slug + domain)
  if (body.name && body.name !== agent.name) {
    const newSlug = nameToSlug(body.name);
    if (!newSlug) {
      return NextResponse.json(
        { error: "Name must contain at least one letter or number" },
        { status: 400 },
      );
    }

    const slugExists = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.slug, newSlug)))
      .limit(1);

    if (slugExists.length > 0 && slugExists[0].id !== agentId) {
      return NextResponse.json(
        { error: `Name "${body.name}" is already taken` },
        { status: 409 },
      );
    }

    dbUpdates.name = body.name;
    dbUpdates.slug = newSlug;

    const baseDomain = process.env.AGENT_BASE_DOMAIN;
    if (baseDomain) {
      const newDomain = `https://${newSlug}.${baseDomain}`;
      dbUpdates.coolifyDomain = newDomain;

      if (agent.coolifyAppUuid) {
        const coolify = getCoolifyClient();
        await coolify.updateApplication(agent.coolifyAppUuid, {
          name: newSlug,
          domains: newDomain,
        });
        needsRedeploy = true;
      }
    }
  }

  // Handle config field changes
  const hasConfigChanges = CONFIG_FIELDS.some((f) => body[f] !== undefined);

  if (hasConfigChanges) {
    // Decrypt current config
    const [tag, salt] = agent.configTag.split(":");
    const currentConfigStr = decrypt({
      ciphertext: agent.configEncrypted,
      iv: agent.configIv,
      tag,
      salt,
    });
    const currentConfig = JSON.parse(currentConfigStr);

    // Build new OpenClaw config from current + overrides
    const newConfig: OpenClawConfig = {
      provider: body.provider ?? currentConfig.models?.default?.provider ?? "",
      apiKey: body.apiKey ?? currentConfig._apiKey ?? "",
      model: body.model ?? currentConfig.models?.default?.model ?? "",
      telegramBotToken: body.telegramBotToken ?? currentConfig.channels?.telegram?.botToken,
      discordBotToken: body.discordBotToken ?? currentConfig.channels?.discord?.botToken,
      slackBotToken: body.slackBotToken ?? currentConfig.channels?.slack?.botToken,
      slackAppToken: body.slackAppToken ?? currentConfig.channels?.slack?.appToken,
    };

    // Regenerate config and re-encrypt
    const { configJson } = generateOpenClawConfig(newConfig);
    // Preserve the API key in stored config
    const configWithKey = JSON.parse(configJson);
    configWithKey._apiKey = newConfig.apiKey;
    const configToStore = JSON.stringify(configWithKey, null, 2);

    const encrypted = encrypt(configToStore);

    dbUpdates.configEncrypted = encrypted.ciphertext;
    dbUpdates.configIv = encrypted.iv;
    dbUpdates.configTag = encrypted.tag + ":" + encrypted.salt;

    if (agent.coolifyAppUuid) {
      needsRedeploy = true;
    }
  }

  await db.update(agents).set(dbUpdates).where(eq(agents.id, agentId));

  // Update env vars and redeploy
  if (needsRedeploy && agent.coolifyAppUuid) {
    await updateAgentEnvVars(agentId);
    const coolify = getCoolifyClient();
    await coolify.startApplication(agent.coolifyAppUuid);
  }

  return NextResponse.json({ success: true, redeployed: needsRedeploy });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await params;

  const existing = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  try {
    await deleteAgent(agentId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
