import { NextRequest, NextResponse } from "next/server";
import {
  submit2FA,
  getSessionStatus,
  cleanupSession,
} from "@/lib/telegram/session-manager";
import { injectTelegramSession, startAgent } from "@/lib/agents/deployment";
import { z } from "zod";

const schema = z.object({
  sessionKey: z.string().uuid(),
  password: z.string().min(1),
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

  const result = submit2FA(parsed.data.sessionKey, parsed.data.password);

  if (result.status === "error") {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Wait for Telegram to process the password
  await new Promise((r) => setTimeout(r, 3000));

  const status = getSessionStatus(parsed.data.sessionKey);
  if (!status) {
    return NextResponse.json(
      { error: "Session expired" },
      { status: 400 },
    );
  }

  if (status.status === "completed" && status.sessionString) {
    if (status.agentId) {
      // Session page mode: inject into existing agent and start it
      await injectTelegramSession(status.agentId, status.sessionString);
      await startAgent(status.agentId);
      cleanupSession(parsed.data.sessionKey);
      return NextResponse.json({ status: status.status });
    } else {
      // Wizard mode: return session string for agent creation
      const sessionString = status.sessionString;
      cleanupSession(parsed.data.sessionKey);
      return NextResponse.json({
        status: status.status,
        sessionString,
      });
    }
  }

  return NextResponse.json({
    status: status.status,
    error: status.error,
  });
}
