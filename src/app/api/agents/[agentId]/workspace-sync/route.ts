import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// Max workspace archive size: 50MB base64 (~37MB raw)
const MAX_ARCHIVE_SIZE = 50 * 1024 * 1024;

/**
 * Auth: accepts either x-user-id header (dashboard) or
 * x-sync-token header (container callback using webuiAuthToken).
 */
async function getAgent(agentId: string, req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  const syncToken = req.headers.get("x-sync-token");

  if (!userId && !syncToken) {
    return null;
  }

  const conditions = userId
    ? and(eq(agents.id, agentId), eq(agents.userId, userId))
    : eq(agents.id, agentId);

  const results = await db
    .select()
    .from(agents)
    .where(conditions)
    .limit(1);

  if (results.length === 0) return null;

  // Verify sync token if using container auth
  if (syncToken && results[0].webuiAuthToken !== syncToken) {
    return null;
  }

  return results[0];
}

// GET: Download workspace archive
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  const agent = await getAgent(agentId, req);

  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!agent.workspaceArchive) {
    return new NextResponse(null, { status: 204 });
  }

  const binary = Buffer.from(agent.workspaceArchive, "base64");
  return new NextResponse(binary, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Length": String(binary.length),
    },
  });
}

// POST: Upload workspace archive
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  const agent = await getAgent(agentId, req);

  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.arrayBuffer();
  if (body.byteLength > MAX_ARCHIVE_SIZE) {
    return NextResponse.json(
      { error: `Archive too large (max ${MAX_ARCHIVE_SIZE / 1024 / 1024}MB)` },
      { status: 413 },
    );
  }

  const archive = Buffer.from(body).toString("base64");

  await db
    .update(agents)
    .set({ workspaceArchive: archive, updatedAt: new Date() })
    .where(eq(agents.id, agentId));

  return NextResponse.json({ success: true, size: body.byteLength });
}
