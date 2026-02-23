import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAgent } from "@/lib/agents/deployment";
import { syncAgentFromCoolify } from "@/lib/agents/sync-status";
import { z } from "zod";

const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.string(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  utilityModel: z.string().optional(),
  telegramApiId: z.number().int().positive(),
  telegramApiHash: z.string().min(1),
  telegramPhone: z.string().min(1),
  adminIds: z.array(z.number().int()),
  dmPolicy: z.string().optional(),
  groupPolicy: z.string().optional(),
  requireMention: z.boolean().optional(),
  botToken: z.string().optional(),
  ownerName: z.string().optional(),
  ownerUsername: z.string().optional(),
  tavilyApiKey: z.string().optional(),
  tonapiKey: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userAgents = await db
    .select({
      id: agents.id,
      name: agents.name,
      status: agents.status,
      telegramSessionStatus: agents.telegramSessionStatus,
      coolifyAppUuid: agents.coolifyAppUuid,
      coolifyDomain: agents.coolifyDomain,
      lastHealthCheck: agents.lastHealthCheck,
      lastError: agents.lastError,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
    })
    .from(agents)
    .where(eq(agents.userId, userId))
    .orderBy(agents.createdAt);

  // Sync status from Coolify for all agents in parallel
  const synced = await Promise.all(
    userAgents.map(async (agent) => {
      const result = await syncAgentFromCoolify(agent);
      if (result) {
        return { ...agent, status: result.status, coolifyDomain: result.coolifyDomain || agent.coolifyDomain };
      }
      return agent;
    }),
  );

  return NextResponse.json({ agents: synced });
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const agentId = await createAgent({
      userId,
      name: parsed.data.name,
      config: {
        provider: parsed.data.provider,
        apiKey: parsed.data.apiKey,
        model: parsed.data.model,
        utilityModel: parsed.data.utilityModel,
        telegramApiId: parsed.data.telegramApiId,
        telegramApiHash: parsed.data.telegramApiHash,
        telegramPhone: parsed.data.telegramPhone,
        adminIds: parsed.data.adminIds,
        dmPolicy: parsed.data.dmPolicy,
        groupPolicy: parsed.data.groupPolicy,
        requireMention: parsed.data.requireMention,
        botToken: parsed.data.botToken,
        ownerName: parsed.data.ownerName,
        ownerUsername: parsed.data.ownerUsername,
        tavilyApiKey: parsed.data.tavilyApiKey,
        tonapiKey: parsed.data.tonapiKey,
        webuiEnabled: true,
      },
    });

    return NextResponse.json({ agentId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
