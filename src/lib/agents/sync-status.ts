import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCoolifyClient, CoolifyApiError } from "@/lib/coolify/client";

// States managed by our own logic that Coolify shouldn't override
// unless Coolify explicitly says the container is running
const PROTECTED_STATES = ["awaiting_session", "provisioning", "deleting"];

function mapCoolifyStatus(
  coolifyStatus: string | undefined | null,
  currentDbStatus: string,
): string {
  if (!coolifyStatus) return currentDbStatus;

  const s = String(coolifyStatus).toLowerCase().trim();

  // Running is always authoritative from Coolify
  if (s.includes("running")) return "running";

  // Don't let Coolify override our own managed states
  if (PROTECTED_STATES.includes(currentDbStatus)) {
    return currentDbStatus;
  }

  // Map Coolify states to our states
  if (s.includes("exited") || s.includes("stopped")) return "stopped";
  if (s.includes("restarting") || s.includes("starting")) return "starting";
  if (s.includes("removing") || s.includes("degraded") || s.includes("error")) return "error";

  // If we don't recognize the status, keep current
  console.log(`[sync] Unknown Coolify status: "${coolifyStatus}" for agent in state "${currentDbStatus}"`);
  return currentDbStatus;
}

interface AgentForSync {
  id: string;
  status: string;
  coolifyAppUuid: string | null;
  coolifyDomain: string | null;
}

interface SyncResult {
  status: string;
  coolifyDomain: string | null;
  coolifyStatus?: string; // raw status from Coolify for debugging
}

/**
 * Sync a single agent's status from Coolify.
 * Returns the updated fields (status, domain) without modifying the input object.
 */
export async function syncAgentFromCoolify(agent: AgentForSync): Promise<SyncResult | null> {
  if (!agent.coolifyAppUuid) return null;
  if (PROTECTED_STATES.includes(agent.status)) return null;

  try {
    const coolify = getCoolifyClient();
    const coolifyService = await coolify.getService(agent.coolifyAppUuid);

    console.log(`[sync] Agent ${agent.id} (db=${agent.status}): Coolify response status="${coolifyService.status}", fqdn="${coolifyService.fqdn}"`, JSON.stringify(Object.keys(coolifyService)));

    const rawStatus = coolifyService.status ? String(coolifyService.status) : null;
    const mappedStatus = mapCoolifyStatus(rawStatus, agent.status);
    const fqdn = coolifyService.fqdn ? String(coolifyService.fqdn) : null;

    console.log(`[sync] Agent ${agent.id}: raw="${rawStatus}" → mapped="${mappedStatus}" (was "${agent.status}")`);

    const updates: Record<string, unknown> = {};
    let changed = false;

    if (mappedStatus !== agent.status) {
      updates.status = mappedStatus;
      changed = true;
    }

    if (fqdn && fqdn !== agent.coolifyDomain) {
      updates.coolifyDomain = fqdn;
      changed = true;
    }

    if (changed) {
      updates.lastHealthCheck = new Date();
      updates.updatedAt = new Date();
      await db.update(agents).set(updates).where(eq(agents.id, agent.id));
    }

    return {
      status: mappedStatus,
      coolifyDomain: fqdn || agent.coolifyDomain,
      coolifyStatus: rawStatus || undefined,
    };
  } catch (err) {
    // Don't fail if Coolify is unreachable
    if (err instanceof CoolifyApiError) {
      console.log(`[sync] Coolify API error for agent ${agent.id}: ${err.message}`);
    }
    return null;
  }
}
