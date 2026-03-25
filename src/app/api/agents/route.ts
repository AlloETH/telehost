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
  telegramBotToken: z.string().optional(),
  discordBotToken: z.string().optional(),
  slackBotToken: z.string().optional(),
  slackAppToken: z.string().optional(),
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
      coolifyAppUuid: agents.coolifyAppUuid,
      lastHealthCheck: agents.lastHealthCheck,
      lastError: agents.lastError,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
    })
    .from(agents)
    .where(eq(agents.userId, userId))
    .orderBy(agents.createdAt);

  // Sync status from Coolify for all agents in parallel (with timeout)
  const synced = await Promise.all(
    userAgents.map(async (agent) => {
      try {
        const result = await Promise.race([
          syncAgentFromCoolify(agent),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
        if (result) {
          return { ...agent, status: result.status };
        }
      } catch {
        // Coolify unreachable — return cached status
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
        telegramBotToken: parsed.data.telegramBotToken,
        discordBotToken: parsed.data.discordBotToken,
        slackBotToken: parsed.data.slackBotToken,
        slackAppToken: parsed.data.slackAppToken,
      },
    });

    return NextResponse.json({ agentId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
