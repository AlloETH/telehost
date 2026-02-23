import { NextRequest, NextResponse } from "next/server";
import {
  submitCode,
  getSessionStatus,
  cleanupSession,
} from "@/lib/telegram/session-manager";
import { injectTelegramSession, startAgent } from "@/lib/agents/deployment";
import { z } from "zod";

const schema = z.object({
  sessionKey: z.string().uuid(),
  code: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = submitCode(parsed.data.sessionKey, parsed.data.code);

  if (result.status === "error") {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Wait for Telegram to process the code
  await new Promise((r) => setTimeout(r, 3000));

  // Check if auth completed or needs 2FA
  const status = getSessionStatus(parsed.data.sessionKey);
  if (!status) {
    return NextResponse.json(
      { error: "Session expired" },
      { status: 400 },
    );
  }

  // If completed, inject session and start agent
  if (status.status === "completed" && status.sessionString && status.agentId) {
    await injectTelegramSession(status.agentId, status.sessionString);
    await startAgent(status.agentId);
    cleanupSession(parsed.data.sessionKey);
  }

  return NextResponse.json({
    status: status.status,
    error: status.error,
  });
}
