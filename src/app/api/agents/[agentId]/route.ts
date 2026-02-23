import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { deleteAgent } from "@/lib/agents/deployment";
import { syncAgentFromCoolify } from "@/lib/agents/sync-status";
import { encrypt, decrypt } from "@/lib/crypto";
import { generateConfigYaml } from "@/lib/agents/config-generator";
import { nameToSlug } from "@/lib/agents/slug";
import { getCoolifyClient } from "@/lib/coolify/client";
import { parse } from "yaml";

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
      telegramSessionStatus: agents.telegramSessionStatus,
      coolifyAppUuid: agents.coolifyAppUuid,
      coolifyDomain: agents.coolifyDomain,
      webuiAuthToken: agents.webuiAuthToken,
      walletAddress: agents.walletAddress,
      lastHealthCheck: agents.lastHealthCheck,
      lastError: agents.lastError,
      restartCount: agents.restartCount,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
      stoppedAt: agents.stoppedAt,
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
  }

  // Decrypt config to expose editable settings
  try {
    const [tag, salt] = configTag.split(":");
    const yamlStr = decrypt({ ciphertext: configEncrypted, iv: configIv, tag, salt });
    const parsed = parse(yamlStr);
    const agentSection = parsed.agent || {};
    const telegramSection = parsed.telegram || {};

    agent.config = {
      provider: agentSection.provider,
      apiKey: agentSection.api_key,
      model: agentSection.model,
      dmPolicy: telegramSection.dm_policy,
      groupPolicy: telegramSection.group_policy,
      ownerName: telegramSection.owner_name,
      ownerUsername: telegramSection.owner_username,
      tavilyApiKey: agentSection.tavily_api_key,
      tonapiKey: agentSection.tonapi_key,
    };
  } catch {
    // Config decryption failed — don't expose config
  }

  return NextResponse.json({ agent });
}

// Config fields that can be updated via PATCH
const CONFIG_FIELDS = [
  "provider", "apiKey", "model",
  "dmPolicy", "groupPolicy",
  "ownerName", "ownerUsername",
  "tavilyApiKey", "tonapiKey",
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

    // Check slug uniqueness
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

    // Update domain if AGENT_BASE_DOMAIN is set
    const baseDomain = process.env.AGENT_BASE_DOMAIN;
    if (baseDomain) {
      const newDomain = `https://${newSlug}.${baseDomain}`;
      dbUpdates.coolifyDomain = newDomain;

      if (agent.coolifyAppUuid) {
        const coolify = getCoolifyClient();
        await coolify.updateApp(agent.coolifyAppUuid, { fqdn: newDomain, name: newSlug });
        needsRedeploy = true;
      }
    }
  }

  // Handle config field changes
  const hasConfigChanges = CONFIG_FIELDS.some((f) => body[f] !== undefined);

  if (hasConfigChanges) {
    // Decrypt current config
    const [tag, salt] = agent.configTag.split(":");
    const currentYaml = decrypt({
      ciphertext: agent.configEncrypted,
      iv: agent.configIv,
      tag,
      salt,
    });
    const currentConfig = parse(currentYaml);

    // Build AgentConfig from current config + overrides
    const agentSection = currentConfig.agent || {};
    const telegramSection = currentConfig.telegram || {};
    const webuiSection = currentConfig.webui || {};

    let phone = String(telegramSection.phone ?? "");
    if (phone && !phone.startsWith("+")) phone = "+" + phone;

    const mergedConfig = {
      provider: body.provider ?? agentSection.provider,
      apiKey: body.apiKey ?? agentSection.api_key,
      model: body.model ?? agentSection.model,
      utilityModel: agentSection.utility_model,
      maxTokens: agentSection.max_tokens,
      temperature: agentSection.temperature,
      telegramApiId: telegramSection.api_id,
      telegramApiHash: telegramSection.api_hash,
      telegramPhone: phone,
      adminIds: telegramSection.admin_ids || [],
      dmPolicy: body.dmPolicy ?? telegramSection.dm_policy,
      groupPolicy: body.groupPolicy ?? telegramSection.group_policy,
      requireMention: telegramSection.require_mention,
      debouncMs: telegramSection.debounce_ms,
      botToken: telegramSection.bot_token,
      ownerName: body.ownerName ?? telegramSection.owner_name,
      ownerUsername: body.ownerUsername ?? telegramSection.owner_username,
      tavilyApiKey: body.tavilyApiKey ?? agentSection.tavily_api_key,
      tonapiKey: body.tonapiKey ?? agentSection.tonapi_key,
      webuiEnabled: webuiSection.enabled,
      webuiPort: webuiSection.port,
      webuiAuthToken: webuiSection.auth_token,
    };

    // Regenerate YAML and re-encrypt
    const newYaml = generateConfigYaml(mergedConfig);
    const encrypted = encrypt(newYaml);

    dbUpdates.configEncrypted = encrypted.ciphertext;
    dbUpdates.configIv = encrypted.iv;
    dbUpdates.configTag = encrypted.tag + ":" + encrypted.salt;

    // Update Coolify env var
    if (agent.coolifyAppUuid) {
      const configB64 = Buffer.from(newYaml).toString("base64");
      const coolify = getCoolifyClient();
      await coolify.setEnvVar(agent.coolifyAppUuid, {
        key: "TELETON_CONFIG_B64",
        value: configB64,
        is_literal: true,
        is_shown_once: true,
      });
      needsRedeploy = true;
    }
  }

  await db.update(agents).set(dbUpdates).where(eq(agents.id, agentId));

  // Redeploy if Coolify env vars were changed
  if (needsRedeploy && agent.coolifyAppUuid) {
    const coolify = getCoolifyClient();
    await coolify.deployApp(agent.coolifyAppUuid);
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
