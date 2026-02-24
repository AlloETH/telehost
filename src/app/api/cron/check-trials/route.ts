import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, subscriptions } from "@/lib/db/schema";
import { eq, and, lt, isNotNull, notInArray } from "drizzle-orm";
import { getCoolifyClient } from "@/lib/coolify/client";
import { checkExpirations } from "@/lib/ton/subscription";

const CRON_SECRET = process.env.CRON_SECRET;

// 24 hours after trial start = 23 hours after trialEndsAt (which is 1h after creation)
const DELETE_AFTER_MS = 23 * 60 * 60 * 1000;

function authorize(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${CRON_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const results = { stopped: 0, deleted: 0, errors: [] as string[] };

  // 1. Stop trial agents that have exceeded the 1-hour trial
  const expiredTrials = await db
    .select({
      id: agents.id,
      coolifyAppUuid: agents.coolifyAppUuid,
      status: agents.status,
      userId: agents.userId,
    })
    .from(agents)
    .where(
      and(
        isNotNull(agents.trialEndsAt),
        lt(agents.trialEndsAt, now),
        eq(agents.status, "running"),
      ),
    );

  const coolify = getCoolifyClient();

  for (const agent of expiredTrials) {
    try {
      if (agent.coolifyAppUuid) {
        await coolify.stopApplication(agent.coolifyAppUuid);
      }
      await db
        .update(agents)
        .set({
          status: "suspended",
          lastError: "Free trial expired. Subscribe to restart your agent.",
          updatedAt: now,
        })
        .where(eq(agents.id, agent.id));
      results.stopped++;
    } catch (err) {
      results.errors.push(`stop ${agent.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Delete agents 24h after creation (trialEndsAt + 23h) with no active subscription
  const deleteThreshold = new Date(now.getTime() - DELETE_AFTER_MS);
  const abandonedAgents = await db
    .select({
      id: agents.id,
      coolifyAppUuid: agents.coolifyAppUuid,
      userId: agents.userId,
    })
    .from(agents)
    .where(
      and(
        isNotNull(agents.trialEndsAt),
        lt(agents.trialEndsAt, deleteThreshold),
        notInArray(agents.status, ["deleting"]),
      ),
    );

  for (const agent of abandonedAgents) {
    // Check if user has since paid
    const activeSub = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, agent.userId),
          eq(subscriptions.status, "active"),
        ),
      )
      .limit(1);

    if (activeSub.length > 0) continue;

    try {
      if (agent.coolifyAppUuid) {
        try {
          await coolify.deleteApplication(agent.coolifyAppUuid);
        } catch {
          // App may already be gone
        }
      }
      await db.delete(agents).where(eq(agents.id, agent.id));
      results.deleted++;
    } catch (err) {
      results.errors.push(`delete ${agent.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3. Also run subscription expiration checks
  try {
    await checkExpirations();
  } catch (err) {
    results.errors.push(`checkExpirations: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({
    ok: true,
    stopped: results.stopped,
    deleted: results.deleted,
    errors: results.errors.length > 0 ? results.errors : undefined,
  });
}
