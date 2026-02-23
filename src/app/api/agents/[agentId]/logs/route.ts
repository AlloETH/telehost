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
      logs: "Agent has no Coolify service yet.",
      type: "info",
    });
  }

  const coolify = getCoolifyClient();

  // Get the service to find the application UUID
  try {
    const service = await coolify.getService(agent.coolifyAppUuid);

    // Try to get logs from the first service application
    if (
      Array.isArray(service.applications) &&
      service.applications.length > 0
    ) {
      const appUuid = service.applications[0].uuid;
      try {
        const logs = await coolify.getApplicationLogs(appUuid, tail);
        return NextResponse.json({
          logs,
          type: "runtime",
          status: service.status || null,
        });
      } catch (logErr) {
        // Logs endpoint not available — fall through to status info
        console.log(
          `[logs] Application logs not available for ${appUuid}:`,
          logErr instanceof Error ? logErr.message : logErr,
        );
      }
    }

    // Fallback: return service status info as "logs"
    const statusInfo = [
      `Service: ${agent.coolifyAppUuid}`,
      `Status: ${service.status || "unknown"}`,
      `Name: ${service.name || agent.name}`,
    ];

    if (service.fqdn) statusInfo.push(`Domain: ${service.fqdn}`);

    if (agent.lastError) {
      statusInfo.push("", `Last error: ${agent.lastError}`);
    }

    if (agent.lastHealthCheck) {
      statusInfo.push(
        `Last health check: ${new Date(agent.lastHealthCheck).toISOString()}`,
      );
    }

    statusInfo.push(
      "",
      "Container logs are not available via the Coolify API for this service type.",
      "Check the Coolify dashboard for detailed container logs.",
    );

    return NextResponse.json({
      logs: statusInfo.join("\n"),
      type: "info",
      status: service.status || null,
    });
  } catch (err) {
    if (err instanceof CoolifyApiError) {
      return NextResponse.json({
        logs: `Failed to fetch from Coolify: ${err.message}`,
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
