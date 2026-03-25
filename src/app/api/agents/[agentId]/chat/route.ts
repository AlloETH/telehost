import { NextRequest, NextResponse } from "next/server";
import { resolveGatewayClient, AgentNotFoundError, AgentNotRunningError } from "@/lib/openclaw/resolve";
import { chatCompletionsStream, GatewayError } from "@/lib/openclaw/client";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { agentId } = await params;
  const body = await req.json();

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages array is required" }, { status: 400 });
  }

  try {
    const { client } = await resolveGatewayClient(agentId, userId);

    const gwResponse = await chatCompletionsStream(client, {
      sessionKey: body.sessionKey,
      messages: body.messages,
      model: body.model,
    });

    // Proxy the SSE stream directly to the client
    return new Response(gwResponse.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
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
    console.error("[chat]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
