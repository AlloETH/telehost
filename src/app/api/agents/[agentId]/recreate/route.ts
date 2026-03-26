import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { deleteAgent, createAgent } from "@/lib/agents/deployment";
import { decrypt } from "@/lib/crypto";

/**
 * Re-create an agent that failed during provisioning.
 * Deletes the broken record and creates a fresh one with the same config.
 */
export async function POST(
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

  const agent = existing[0];

  if (agent.status !== "error") {
    return NextResponse.json(
      { error: "Can only recreate agents in error state" },
      { status: 400 },
    );
  }

  // Decrypt config to reconstruct the creation input
  let config;
  try {
    const [tag, salt] = agent.configTag.split(":");
    const configStr = decrypt({
      ciphertext: agent.configEncrypted,
      iv: agent.configIv,
      tag,
      salt,
    });
    const parsed = JSON.parse(configStr);
    const modelStr = parsed.agents?.defaults?.model?.primary || "";
    const [provider, ...modelParts] = modelStr.split("/");

    config = {
      provider: provider || "",
      apiKey: parsed._apiKey || "",
      model: modelParts.join("/") || "",
      telegramBotToken: parsed.channels?.telegram?.botToken,
      discordBotToken: parsed.channels?.discord?.botToken,
      slackBotToken: parsed.channels?.slack?.botToken,
      slackAppToken: parsed.channels?.slack?.appToken,
    };
  } catch {
    return NextResponse.json(
      { error: "Failed to recover agent configuration" },
      { status: 500 },
    );
  }

  const name = agent.name;

  // Delete the broken agent
  try {
    await deleteAgent(agentId);
  } catch {
    // If delete fails, try to proceed anyway
  }

  // Create a fresh agent with the same config
  try {
    const newAgentId = await createAgent({
      userId,
      name,
      config,
    });
    return NextResponse.json({ agentId: newAgentId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
