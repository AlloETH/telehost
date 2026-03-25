import { NextRequest, NextResponse } from "next/server";
import { resolveGatewayClient, AgentNotFoundError, AgentNotRunningError } from "@/lib/openclaw/resolve";
import { listSessions, createSession, GatewayError } from "@/lib/openclaw/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { agentId } = await params;

  try {
    const { client } = await resolveGatewayClient(agentId, userId);
    const search = req.nextUrl.searchParams.get("search") || undefined;
    const sessions = await listSessions(client, { search });
    return NextResponse.json({ sessions });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { agentId } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const { client } = await resolveGatewayClient(agentId, userId);
    const session = await createSession(client, {
      label: body.label,
      message: body.message,
    });
    return NextResponse.json(session, { status: 201 });
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
  console.error("[sessions]", err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
