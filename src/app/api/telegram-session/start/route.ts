import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { startSession } from "@/lib/telegram/session-manager";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

// Two modes:
// 1. Wizard mode: { apiId, apiHash, phone } — no agent exists yet
// 2. Session page mode: { agentId } — reads credentials from stored config
const wizardSchema = z.object({
  apiId: z.number().int().positive(),
  apiHash: z.string().min(1),
  phone: z.string().min(1),
  agentId: z.string().uuid().optional(),
});

const agentSchema = z.object({
  agentId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  let apiId: number;
  let apiHash: string;
  let phone: string;
  let agentId: string | null = null;

  if (body.apiId && body.apiHash && body.phone) {
    // Wizard mode: credentials provided directly
    const parsed = wizardSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    apiId = parsed.data.apiId;
    apiHash = parsed.data.apiHash;
    phone = parsed.data.phone;
    if (!phone.startsWith("+")) phone = "+" + phone;
    agentId = parsed.data.agentId ?? null;
  } else {
    // Session page mode: read from agent config
    const parsed = agentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

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

    const agent = existing[0];
    agentId = agent.id;

    const [tag, salt] = agent.configTag.split(":");
    const configYaml = decrypt({
      ciphertext: agent.configEncrypted,
      iv: agent.configIv,
      tag,
      salt,
    });
    const config = parseYaml(configYaml);
    apiId = Number(config?.telegram?.api_id);
    apiHash = config?.telegram?.api_hash;
    phone = String(config?.telegram?.phone ?? "");
    if (phone && !phone.startsWith("+")) phone = "+" + phone;

    if (!apiId || !apiHash || !phone) {
      return NextResponse.json(
        { error: "Telegram credentials not found in agent config" },
        { status: 400 },
      );
    }
  }

  const sessionKey = randomUUID();

  // startSession is now synchronous — fires off auth in background
  const result = startSession(
    sessionKey,
    apiId,
    apiHash,
    phone,
    agentId,
    userId,
  );

  if (result.status === "error") {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Returns immediately with "connecting" status
  // Frontend polls /api/telegram-session/status for updates
  return NextResponse.json({
    sessionKey,
    status: result.status,
  });
}
