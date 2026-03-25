import { Injectable, Inject } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { eq, and, lt, isNotNull, notInArray } from "drizzle-orm";
import { DB, type Db } from "../db/db.module";
import { agents, subscriptions } from "../db/schema";
import { CoolifyService } from "../coolify/coolify.service";
import { BillingController } from "../billing/billing.controller";

@Injectable()
export class CronService {
  constructor(
    @Inject(DB) private db: Db,
    private coolify: CoolifyService,
    private billing: BillingController,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkTrials() {
    const now = new Date();
    console.log("[cron] Running trial check...");

    // 1. Stop expired trial agents
    const expired = await this.db
      .select({ id: agents.id, coolifyAppUuid: agents.coolifyAppUuid, userId: agents.userId })
      .from(agents)
      .where(and(isNotNull(agents.trialEndsAt), lt(agents.trialEndsAt, now), eq(agents.status, "running")));

    for (const agent of expired) {
      try {
        if (agent.coolifyAppUuid) await this.coolify.stopApplication(agent.coolifyAppUuid);
        await this.db.update(agents).set({ status: "suspended", lastError: "Free trial expired. Subscribe to restart your agent.", updatedAt: now }).where(eq(agents.id, agent.id));
      } catch (err) { console.error(`[cron] Failed to stop ${agent.id}:`, err); }
    }

    // 2. Delete abandoned agents (24h after trial start)
    const deleteThreshold = new Date(now.getTime() - 23 * 60 * 60 * 1000);
    const abandoned = await this.db
      .select({ id: agents.id, coolifyAppUuid: agents.coolifyAppUuid, userId: agents.userId })
      .from(agents)
      .where(and(isNotNull(agents.trialEndsAt), lt(agents.trialEndsAt, deleteThreshold), notInArray(agents.status, ["deleting"])));

    for (const agent of abandoned) {
      const activeSub = await this.db.select({ id: subscriptions.id }).from(subscriptions).where(and(eq(subscriptions.userId, agent.userId), eq(subscriptions.status, "active"))).limit(1);
      if (activeSub.length > 0) continue;
      try {
        if (agent.coolifyAppUuid) { try { await this.coolify.deleteApplication(agent.coolifyAppUuid); } catch {} }
        await this.db.delete(agents).where(eq(agents.id, agent.id));
      } catch (err) { console.error(`[cron] Failed to delete ${agent.id}:`, err); }
    }

    // 3. Check subscription expirations
    try { await this.billing.checkExpirations(); } catch (err) { console.error("[cron] checkExpirations failed:", err); }

    console.log(`[cron] Done: stopped=${expired.length}, checked-abandoned=${abandoned.length}`);
  }
}
