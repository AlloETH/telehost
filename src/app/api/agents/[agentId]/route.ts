import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { deleteAgent } from "@/lib/agents/deployment";
import { getCoolifyClient } from "@/lib/coolify/client";

function mapCoolifyStatus(coolifyStatus: string, currentDbStatus: string): string {
  const s = coolifyStatus.toLowerCase();
  if (s.includes("running") || s.includes("healthy")) return "running";
  if (s.includes("exited") || s.includes("stopped") || s === "stopped") return "stopped";
  if (s.includes("restarting")) return "starting";
  if (s.includes("removing") || s.includes("degraded")) return "error";
  // Don't override transitional DB states like awaiting_session/provisioning
  // if Coolify just says the app isn't running yet
  if (currentDbStatus === "awaiting_session" || currentDbStatus === "provisioning") {
    return currentDbStatus;
  }
  return currentDbStatus;
}

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

  const agent = { ...results[0] };

  // Sync status from Coolify if app exists and not in a terminal/transitional state we control
  if (agent.coolifyAppUuid && !["deleting", "provisioning"].includes(agent.status)) {
    try {
      const coolify = getCoolifyClient();
      const coolifyApp = await coolify.getApp(agent.coolifyAppUuid);

      const updates: Record<string, unknown> = {};

      // Sync status
      if (coolifyApp.status) {
        const mappedStatus = mapCoolifyStatus(String(coolifyApp.status), agent.status);
        if (mappedStatus !== agent.status) {
          updates.status = mappedStatus;
          agent.status = mappedStatus;
        }
      }

      // Sync domain/fqdn
      const fqdn = coolifyApp.fqdn ? String(coolifyApp.fqdn) : null;
      if (fqdn && fqdn !== agent.coolifyDomain) {
        updates.coolifyDomain = fqdn;
        agent.coolifyDomain = fqdn;
      }

      // Update last health check timestamp
      updates.lastHealthCheck = new Date();
      agent.lastHealthCheck = new Date();

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date();
        await db.update(agents).set(updates).where(eq(agents.id, agentId));
      }
    } catch {
      // Don't fail the GET if Coolify is unreachable
    }
  }

  return NextResponse.json({ agent });
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
