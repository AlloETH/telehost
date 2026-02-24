import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCoolifyClient, CoolifyApiError } from "@/lib/coolify/client";

// States managed by our own logic that Coolify shouldn't override
// unless Coolify explicitly says the container is running
const PROTECTED_STATES = ["awaiting_session", "provisioning", "deleting", "stopping", "restarting"];

/**
 * Parse Coolify's combined "status:health" string.
 * Examples: "running:healthy", "exited:unhealthy", "degraded", "running", "stopped"
 */
function parseCoolifyStatus(raw: string): {
  containerStatus: string;
  health: string | null;
} {
  const parts = raw.toLowerCase().trim().split(":");
  return {
    containerStatus: parts[0] || "",
    health: parts.length > 1 ? parts[1] : null,
  };
}

function mapCoolifyStatus(
  coolifyStatus: string | undefined | null,
  currentDbStatus: string,
): { status: string; health: string | null; errorDetail: string | null } {
  if (!coolifyStatus) {
    return { status: currentDbStatus, health: null, errorDetail: null };
  }

  const { containerStatus, health } = parseCoolifyStatus(coolifyStatus);

  // Running is always authoritative from Coolify
  if (containerStatus === "running") {
    const errorDetail =
      health === "unhealthy" ? "Container running but health check failing" : null;
    return { status: "running", health, errorDetail };
  }

  // Don't let Coolify override our own managed states
  if (PROTECTED_STATES.includes(currentDbStatus)) {
    return { status: currentDbStatus, health, errorDetail: null };
  }

  // Map Coolify container states to our states
  if (containerStatus === "exited" || containerStatus === "stopped") {
    return {
      status: "stopped",
      health,
      errorDetail:
        health === "unhealthy" ? "Container exited with unhealthy status" : null,
    };
  }

  if (containerStatus === "restarting" || containerStatus === "starting") {
    return { status: "starting", health, errorDetail: null };
  }

  if (containerStatus === "degraded") {
    return {
      status: "error",
      health: health || "degraded",
      errorDetail: "Service is degraded - one or more containers failed",
    };
  }

  if (containerStatus === "error" || containerStatus === "removing") {
    return {
      status: "error",
      health,
      errorDetail: `Container status: ${coolifyStatus}`,
    };
  }

  // Unrecognized status - keep current
  console.log(
    `[sync] Unknown Coolify status: "${coolifyStatus}" for agent in state "${currentDbStatus}"`,
  );
  return { status: currentDbStatus, health, errorDetail: null };
}

interface AgentForSync {
  id: string;
  status: string;
  coolifyAppUuid: string | null;
  coolifyDomain: string | null;
}

export interface SyncResult {
  status: string;
  coolifyDomain: string | null;
  coolifyStatus?: string; // raw status from Coolify
  health?: string | null; // parsed health component (healthy/unhealthy)
  deploymentStatus?: string; // queued | in_progress | finished | failed
}

/**
 * Sync a single agent's status from Coolify.
 * Returns the updated fields without modifying the input object.
 */
export async function syncAgentFromCoolify(
  agent: AgentForSync,
): Promise<SyncResult | null> {
  if (!agent.coolifyAppUuid) return null;
  if (PROTECTED_STATES.includes(agent.status)) return null;

  try {
    const coolify = getCoolifyClient();
    const [app, deployment] = await Promise.all([
      coolify.getApplication(agent.coolifyAppUuid),
      coolify.getLatestDeployment(agent.coolifyAppUuid).catch(() => null),
    ]);

    const rawStatus = app.status ? String(app.status) : null;
    const deploymentStatus = deployment?.status || null;
    const isDeploying =
      deploymentStatus === "queued" || deploymentStatus === "in_progress";

    let mappedStatus: string;
    let health: string | null;
    let errorDetail: string | null;

    if (isDeploying) {
      // Deployment in progress takes priority over container status
      mappedStatus = "deploying";
      health = null;
      errorDetail = null;
    } else {
      ({ status: mappedStatus, health, errorDetail } = mapCoolifyStatus(
        rawStatus,
        agent.status,
      ));
    }

    const fqdn = app.fqdn ? String(app.fqdn) : null;

    const updates: Record<string, unknown> = {
      lastHealthCheck: new Date(),
      updatedAt: new Date(),
    };
    let changed = false;

    if (mappedStatus !== agent.status) {
      updates.status = mappedStatus;
      changed = true;
    }

    if (fqdn && fqdn !== agent.coolifyDomain) {
      updates.coolifyDomain = fqdn;
      changed = true;
    }

    // Update lastError based on health
    if (errorDetail) {
      updates.lastError = errorDetail;
      changed = true;
    } else if (
      (mappedStatus === "running" || mappedStatus === "deploying") &&
      agent.status !== "running"
    ) {
      // Clear error when transitioning to running or deploying
      updates.lastError = null;
      changed = true;
    }

    if (changed) {
      await db.update(agents).set(updates).where(eq(agents.id, agent.id));
    } else {
      // Always update lastHealthCheck even if nothing else changed
      await db
        .update(agents)
        .set({ lastHealthCheck: new Date() })
        .where(eq(agents.id, agent.id));
    }

    return {
      status: mappedStatus,
      coolifyDomain: fqdn || agent.coolifyDomain,
      coolifyStatus: rawStatus || undefined,
      health,
      deploymentStatus: deploymentStatus || undefined,
    };
  } catch (err) {
    if (err instanceof CoolifyApiError) {
      console.log(
        `[sync] Coolify API error for agent ${agent.id}: ${err.message}`,
      );
    }
    return null;
  }
}
