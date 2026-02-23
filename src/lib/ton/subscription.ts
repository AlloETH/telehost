import { db } from "@/lib/db";
import { subscriptions, agents, payments } from "@/lib/db/schema";
import { eq, and, lt } from "drizzle-orm";
import {
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_GRACE_PERIOD_DAYS,
  type SubscriptionTier,
} from "@/lib/constants";
import { getCoolifyClient } from "@/lib/coolify/client";

export async function activateSubscription(
  userId: string,
  tier: SubscriptionTier,
  paymentId: string,
): Promise<void> {
  const tierConfig = SUBSCRIPTION_TIERS[tier];
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    const sub = existing[0];
    // If active, extend from current period end
    const startFrom =
      sub.status === "active" && sub.currentPeriodEnd > now
        ? sub.currentPeriodEnd
        : now;
    const newEnd = new Date(startFrom.getTime() + 30 * 24 * 60 * 60 * 1000);

    await db
      .update(subscriptions)
      .set({
        tier,
        status: "active",
        currentPeriodStart: startFrom === now ? now : sub.currentPeriodStart,
        currentPeriodEnd: newEnd,
        graceEndsAt: null,
        maxAgents: tierConfig.maxAgents,
        memoryLimitMb: tierConfig.memoryLimitMb,
        cpuLimit: tierConfig.cpuLimit,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, sub.id));

    // Link payment to subscription
    await db
      .update(payments)
      .set({ subscriptionId: sub.id })
      .where(eq(payments.id, paymentId));
  } else {
    const [newSub] = await db
      .insert(subscriptions)
      .values({
        userId,
        tier,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        maxAgents: tierConfig.maxAgents,
        memoryLimitMb: tierConfig.memoryLimitMb,
        cpuLimit: tierConfig.cpuLimit,
      })
      .returning();

    await db
      .update(payments)
      .set({ subscriptionId: newSub.id })
      .where(eq(payments.id, paymentId));
  }
}


export async function checkExpirations(): Promise<void> {
  const now = new Date();
  const gracePeriodMs =
    SUBSCRIPTION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

  // Active subscriptions past their period end → past_due
  const expiredActive = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "active"),
        lt(subscriptions.currentPeriodEnd, now),
      ),
    );

  for (const sub of expiredActive) {
    const graceEnd = new Date(
      sub.currentPeriodEnd.getTime() + gracePeriodMs,
    );
    await db
      .update(subscriptions)
      .set({
        status: "past_due",
        graceEndsAt: graceEnd,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, sub.id));
  }

  // Past-due subscriptions past their grace period → expired
  const expiredGrace = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "past_due"),
        lt(subscriptions.graceEndsAt!, now),
      ),
    );

  for (const sub of expiredGrace) {
    await db
      .update(subscriptions)
      .set({ status: "expired", updatedAt: now })
      .where(eq(subscriptions.id, sub.id));

    // Suspend all user's agents
    await suspendUserAgents(sub.userId);
  }
}

async function suspendUserAgents(userId: string): Promise<void> {
  const userAgents = await db
    .select()
    .from(agents)
    .where(
      and(eq(agents.userId, userId), eq(agents.status, "running")),
    );

  const coolify = getCoolifyClient();

  for (const agent of userAgents) {
    if (agent.coolifyAppUuid) {
      try {
        await coolify.stopService(agent.coolifyAppUuid);
      } catch {
        // Continue even if stop fails
      }
    }
    await db
      .update(agents)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(eq(agents.id, agent.id));
  }
}
