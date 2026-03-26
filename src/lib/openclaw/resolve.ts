import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createGatewayClient, type OpenClawGatewayClient } from "./client";

/**
 * Look up an agent by ID + userId and return a gateway client
 * for internal communication. Throws if not found or not running.
 */
export async function resolveGatewayClient(
  agentId: string,
  userId: string,
): Promise<{ client: OpenClawGatewayClient; agent: { id: string; slug: string; status: string } }> {
  const results = await db
    .select({
      id: agents.id,
      slug: agents.slug,
      status: agents.status,
      webuiAuthToken: agents.webuiAuthToken,
      coolifyDomain: agents.coolifyDomain,
    })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
    .limit(1);

  if (results.length === 0) {
    throw new AgentNotFoundError();
  }

  const agent = results[0];

  if (agent.status !== "running") {
    throw new AgentNotRunningError(agent.status);
  }

  if (!agent.webuiAuthToken) {
    throw new Error("Agent has no gateway token");
  }

  return {
    client: createGatewayClient(agent.slug, agent.webuiAuthToken, agent.coolifyDomain ?? undefined),
    agent: { id: agent.id, slug: agent.slug, status: agent.status },
  };
}

export class AgentNotFoundError extends Error {
  constructor() {
    super("Agent not found");
    this.name = "AgentNotFoundError";
  }
}

export class AgentNotRunningError extends Error {
  constructor(public agentStatus: string) {
    super(`Agent is not running (status: ${agentStatus})`);
    this.name = "AgentNotRunningError";
  }
}
