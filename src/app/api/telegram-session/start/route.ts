import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { startSession } from "@/lib/telegram/session-manager";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const schema = z.object({
  agentId: z.string().uuid(),
  apiId: z.number().int().positive(),
  apiHash: z.string().min(1),
  phone: z.string().min(1),
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

  // Verify agent ownership
  const existing = await db
    .select()
    .from(agents)
    .where(
      and(eq(agents.id, parsed.data.agentId), eq(agents.userId, userId)),
    )
    .limit(1);

  if (existing.length === 0) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const sessionKey = randomUUID();
  const result = await startSession(
    sessionKey,
    parsed.data.apiId,
    parsed.data.apiHash,
    parsed.data.phone,
    parsed.data.agentId,
    userId,
  );

  if (result.status === "error") {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    sessionKey,
    status: result.status,
  });
}
