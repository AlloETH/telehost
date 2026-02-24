import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCoolifyClient, CoolifyApiError } from "@/lib/coolify/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await params;
  const tailParam = req.nextUrl.searchParams.get("tail");
  const tail = tailParam ? Math.min(Number(tailParam), 1000) : 100;

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
      logs: "Agent has no Coolify application yet.",
      type: "info",
      status: null,
    });
  }

  const coolify = getCoolifyClient();

  try {
    const [logs, app] = await Promise.all([
      coolify.getApplicationLogs(agent.coolifyAppUuid, tail),
      coolify.getApplication(agent.coolifyAppUuid).catch(() => null),
    ]);

    return NextResponse.json({
      logs: logs || "No logs available.",
      type: "runtime",
      status: app?.status || null,
    });
  } catch (err) {
    if (err instanceof CoolifyApiError) {
      return NextResponse.json({
        logs: `Failed to fetch logs: ${err.message}`,
        type: "error",
        status: null,
      });
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({
      logs: `Error fetching logs: ${message}`,
      type: "error",
      status: null,
    });
  }
}
