import { NextRequest, NextResponse } from "next/server";
import { resolveGatewayClient, AgentNotFoundError, AgentNotRunningError } from "@/lib/openclaw/resolve";
import { getChatHistory, deleteSession, GatewayError } from "@/lib/openclaw/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string; sessionKey: string }> },
) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { agentId, sessionKey } = await params;
  const decodedKey = decodeURIComponent(sessionKey);

  try {
    const { client } = await resolveGatewayClient(agentId, userId);
    const limit = Number(req.nextUrl.searchParams.get("limit")) || 100;
    const messages = await getChatHistory(client, decodedKey, { limit });
    return NextResponse.json({ messages });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string; sessionKey: string }> },
) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { agentId, sessionKey } = await params;
  const decodedKey = decodeURIComponent(sessionKey);

  try {
    const { client } = await resolveGatewayClient(agentId, userId);
    await deleteSession(client, decodedKey);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown): NextResponse {
  if (err instanceof AgentNotFoundError) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  if (err instanceof AgentNotRunningError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof GatewayError) {
    return NextResponse.json(
      { error: "Gateway error", detail: err.body },
      { status: err.status >= 500 ? 502 : err.status },
    );
  }
  console.error("[sessions/history]", err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
