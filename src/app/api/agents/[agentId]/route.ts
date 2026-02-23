import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { deleteAgent } from "@/lib/agents/deployment";

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
      lastHealthCheck: agents.lastHealthCheck,
      lastError: agents.lastError,
      restartCount: agents.restartCount,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
      stoppedAt: agents.stoppedAt,
    })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
    .limit(1);

  if (results.length === 0) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json({ agent: results[0] });
}

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

  // Verify ownership
  const existing = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Only allow updating name for now
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name) updates.name = body.name;

  await db.update(agents).set(updates).where(eq(agents.id, agentId));

  return NextResponse.json({ success: true });
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

  // Verify ownership
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
