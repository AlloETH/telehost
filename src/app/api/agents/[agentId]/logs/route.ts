import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
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

  if (!agent.coolifyAppUuid) {
    return NextResponse.json({
      logs: "Agent has no Coolify service yet.",
      type: "info",
    });
  }

  // The Coolify Services API does not expose a logs endpoint.
  // Direct the user to the Coolify dashboard for container logs.
  return NextResponse.json({
    logs: `Service UUID: ${agent.coolifyAppUuid}\nCheck the Coolify dashboard for container logs.`,
    type: "info",
  });
}
