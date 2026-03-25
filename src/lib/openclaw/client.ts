import { agentInternalUrl } from "@/lib/constants";

/**
 * Server-side client for communicating with an OpenClaw gateway
 * over the internal Docker network. All methods use HTTP — no
 * public exposure required.
 */

export interface OpenClawGatewayClient {
  /** Base URL, e.g. http://my-slug:18789 */
  baseUrl: string;
  token: string;
}

export function createGatewayClient(
  slug: string,
  token: string,
): OpenClawGatewayClient {
  return { baseUrl: agentInternalUrl(slug), token };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function headers(client: OpenClawGatewayClient): Record<string, string> {
  return {
    Authorization: `Bearer ${client.token}`,
    "Content-Type": "application/json",
  };
}

async function gwFetch(
  client: OpenClawGatewayClient,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${client.baseUrl}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(client), ...init?.headers },
  });
  return res;
}

async function gwJson<T = unknown>(
  client: OpenClawGatewayClient,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await gwFetch(client, path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GatewayError(res.status, text);
  }
  return res.json() as Promise<T>;
}

export class GatewayError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Gateway returned ${status}: ${body}`);
    this.name = "GatewayError";
  }
}

// ---------------------------------------------------------------------------
// Tools invoke (session management)
// ---------------------------------------------------------------------------

async function toolsInvoke<T = unknown>(
  client: OpenClawGatewayClient,
  tool: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return gwJson<T>(client, "/tools/invoke", {
    method: "POST",
    body: JSON.stringify({ tool, action: "json", args }),
  });
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface SessionInfo {
  key: string;
  agentId?: string;
  label?: string;
  lastMessage?: { role: string; content: string; timestamp: number };
  createdAt?: number;
  updatedAt?: number;
}

export async function listSessions(
  client: OpenClawGatewayClient,
  opts: {
    limit?: number;
    includeLastMessage?: boolean;
    search?: string;
  } = {},
): Promise<SessionInfo[]> {
  const result = await toolsInvoke<{ sessions: SessionInfo[] }>(
    client,
    "sessions_list",
    {
      limit: opts.limit ?? 50,
      includeLastMessage: opts.includeLastMessage ?? true,
      includeDerivedTitles: true,
      ...(opts.search ? { search: opts.search } : {}),
    },
  );
  return result.sessions ?? [];
}

export async function createSession(
  client: OpenClawGatewayClient,
  opts: {
    label?: string;
    message?: string;
  } = {},
): Promise<{ key: string }> {
  return toolsInvoke<{ key: string }>(client, "sessions_create", {
    agentId: "main",
    ...(opts.label ? { label: opts.label } : {}),
    ...(opts.message ? { message: opts.message } : {}),
  });
}

export async function deleteSession(
  client: OpenClawGatewayClient,
  key: string,
): Promise<void> {
  await toolsInvoke(client, "sessions_delete", { key });
}

// ---------------------------------------------------------------------------
// Chat history
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | Array<{ type: string; text?: string; [k: string]: unknown }>;
  timestamp?: number;
}

export async function getChatHistory(
  client: OpenClawGatewayClient,
  sessionKey: string,
  opts: { limit?: number } = {},
): Promise<ChatMessage[]> {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  const res = await gwJson<{ messages: ChatMessage[] }>(
    client,
    `/sessions/${encodeURIComponent(sessionKey)}/history?${params}`,
  );
  return res.messages ?? [];
}

// ---------------------------------------------------------------------------
// Chat completions (streaming via SSE)
// ---------------------------------------------------------------------------

/**
 * Send a chat message and return the raw Response for SSE streaming.
 * The caller is responsible for reading the stream.
 */
export async function chatCompletionsStream(
  client: OpenClawGatewayClient,
  opts: {
    sessionKey?: string;
    messages: Array<{ role: string; content: string }>;
    model?: string;
  },
): Promise<Response> {
  const body: Record<string, unknown> = {
    messages: opts.messages,
    stream: true,
  };
  if (opts.model) body.model = opts.model;

  const res = await gwFetch(client, "/v1/chat/completions", {
    method: "POST",
    headers: {
      ...headers(client),
      ...(opts.sessionKey
        ? { "X-OpenClaw-Session-Key": opts.sessionKey }
        : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GatewayError(res.status, text);
  }

  return res;
}

/**
 * Send a chat message and wait for the full (non-streaming) response.
 */
export async function chatCompletions(
  client: OpenClawGatewayClient,
  opts: {
    sessionKey?: string;
    messages: Array<{ role: string; content: string }>;
    model?: string;
  },
): Promise<{ content: string; model: string; usage?: Record<string, number> }> {
  const body: Record<string, unknown> = {
    messages: opts.messages,
    stream: false,
  };
  if (opts.model) body.model = opts.model;

  const res = await gwJson<{
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage?: Record<string, number>;
  }>(client, "/v1/chat/completions", {
    method: "POST",
    headers: {
      ...headers(client),
      ...(opts.sessionKey
        ? { "X-OpenClaw-Session-Key": opts.sessionKey }
        : {}),
    },
    body: JSON.stringify(body),
  });

  return {
    content: res.choices?.[0]?.message?.content ?? "",
    model: res.model,
    usage: res.usage,
  };
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function checkHealth(
  client: OpenClawGatewayClient,
): Promise<boolean> {
  try {
    const res = await gwFetch(client, "/healthz");
    return res.ok;
  } catch {
    return false;
  }
}
