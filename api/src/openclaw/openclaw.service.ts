import { Injectable, Inject, NotFoundException, ConflictException } from "@nestjs/common";
import { eq, and } from "drizzle-orm";
import { DB, type Db } from "../db/db.module";
import { agents } from "../db/schema";

const GATEWAY_PORT = "18789";

export interface GatewayClient {
  baseUrl: string;
  token: string;
}

@Injectable()
export class OpenclawService {
  constructor(@Inject(DB) private db: Db) {}

  async resolveClient(agentId: string, userId: string): Promise<GatewayClient> {
    const results = await this.db
      .select({
        id: agents.id,
        slug: agents.slug,
        coolifyAppUuid: agents.coolifyAppUuid,
        coolifyDomain: agents.coolifyDomain,
        status: agents.status,
        webuiAuthToken: agents.webuiAuthToken,
      })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
      .limit(1);

    if (results.length === 0) throw new NotFoundException("Agent not found");
    const agent = results[0];
    if (agent.status !== "running")
      throw new ConflictException(`Agent is not running (status: ${agent.status})`);
    if (!agent.webuiAuthToken)
      throw new Error("Agent has no gateway token");

    // Resolve internal URL: try coolifyDomain (reverse proxy), then Docker DNS by UUID, then by slug
    let baseUrl: string;
    if (agent.coolifyDomain) {
      baseUrl = agent.coolifyDomain.startsWith("http") ? agent.coolifyDomain : `https://${agent.coolifyDomain}`;
    } else if (agent.coolifyAppUuid) {
      baseUrl = `http://${agent.coolifyAppUuid}:${GATEWAY_PORT}`;
    } else {
      baseUrl = `http://${agent.slug}:${GATEWAY_PORT}`;
    }

    console.log(`[openclaw] resolved ${agent.slug} → ${baseUrl}`);

    return { baseUrl, token: agent.webuiAuthToken };
  }

  headers(client: GatewayClient): Record<string, string> {
    return {
      Authorization: `Bearer ${client.token}`,
      "Content-Type": "application/json",
    };
  }

  async gwFetch(client: GatewayClient, path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${client.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers(client), ...(init?.headers || {}) },
    });
  }

  async gwJson<T = unknown>(client: GatewayClient, path: string, init?: RequestInit): Promise<T> {
    const res = await this.gwFetch(client, path, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GatewayError(res.status, text);
    }
    return res.json() as Promise<T>;
  }

  async toolsInvoke<T = unknown>(
    client: GatewayClient,
    tool: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    return this.gwJson<T>(client, "/tools/invoke", {
      method: "POST",
      body: JSON.stringify({ tool, action: "json", args }),
    });
  }
}

export class GatewayError extends Error {
  constructor(public status: number, public body: string) {
    super(`Gateway returned ${status}: ${body}`);
    this.name = "GatewayError";
  }
}
