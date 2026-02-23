import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAgentLogs } from "@/lib/agents/deployment";
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
  const tail = Number(req.nextUrl.searchParams.get("tail")) || 100;

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
    });
  }

  try {
    const coolify = getCoolifyClient();

    // For non-running states, try deployment logs first
    if (["provisioning", "starting", "awaiting_session", "stopped", "error"].includes(agent.status)) {
      try {
        const deployments = await coolify.getDeployments(agent.coolifyAppUuid);
        if (deployments.length > 0) {
          const latest = deployments[0];
          const deploymentLogs = await coolify.getDeploymentLogs(
            agent.coolifyAppUuid,
            latest.deployment_uuid,
          );
          // Also try runtime logs in case container started briefly
          let runtimeLogs = "";
          try {
            runtimeLogs = await getAgentLogs(agentId, tail);
          } catch {
            // No runtime logs available
          }

          const combined = runtimeLogs
            ? `=== Deployment Logs (${latest.status}) ===\n${deploymentLogs}\n\n=== Container Logs ===\n${runtimeLogs}`
            : deploymentLogs;

          return NextResponse.json({
            logs: combined || "No logs available yet. Deployment may still be starting.",
            type: "deployment",
            deploymentStatus: latest.status,
          });
        }
      } catch {
        // Deployment logs not available, fall through to runtime logs
      }
    }

    // Default: fetch runtime container logs
    const logs = await getAgentLogs(agentId, tail);
    return NextResponse.json({ logs: logs || "No logs available.", type: "runtime" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
