import { Controller, Get, Post, Body, Inject, BadRequestException } from "@nestjs/common";
import { eq, and, desc, lt } from "drizzle-orm";
import { beginCell, toNano } from "@ton/core";
import { z } from "zod";
import { DB, type Db } from "../db/db.module";
import { subscriptions, payments, agents } from "../db/schema";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { CoolifyService } from "../coolify/coolify.service";

const SUBSCRIPTION_TIERS = {
  basic: { maxAgents: 1, memoryLimitMb: 2048, cpuLimit: "1.0", priceNanoton: "5000000000", priceTon: 5 },
  pro: { maxAgents: 3, memoryLimitMb: 3072, cpuLimit: "1.5", priceNanoton: "12000000000", priceTon: 12 },
  enterprise: { maxAgents: 10, memoryLimitMb: 4096, cpuLimit: "2.0", priceNanoton: "30000000000", priceTon: 30 },
} as const;

const GRACE_PERIOD_DAYS = 3;

type Tier = keyof typeof SUBSCRIPTION_TIERS;

@Controller("billing")
export class BillingController {
  constructor(@Inject(DB) private db: Db, private coolify: CoolifyService) {}

  @Get("status")
  async status(@CurrentUser() user: CurrentUserPayload) {
    const sub = await this.db.select().from(subscriptions).where(eq(subscriptions.userId, user.userId)).limit(1);
    const recent = await this.db.select({ id: payments.id, amountNanoton: payments.amountNanoton, tier: payments.tier, status: payments.status, memo: payments.memo, confirmedAt: payments.confirmedAt, createdAt: payments.createdAt }).from(payments).where(eq(payments.userId, user.userId)).orderBy(desc(payments.createdAt)).limit(10);
    return { subscription: sub[0] ?? null, payments: recent };
  }

  @Post("subscribe")
  async subscribe(@Body() body: unknown, @CurrentUser() user: CurrentUserPayload) {
    const parsed = z.object({ tier: z.enum(["basic", "pro", "enterprise"]), senderAddress: z.string().min(1) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid input");

    const tier = parsed.data.tier as Tier;
    const tierConfig = SUBSCRIPTION_TIERS[tier];
    const recipientAddress = process.env.TON_SERVICE_WALLET_ADDRESS;
    if (!recipientAddress) throw new Error("TON_SERVICE_WALLET_ADDRESS not configured");

    const memo = `TH-${user.userId.slice(0, 8)}-${Date.now()}`;
    const cell = beginCell().storeUint(0, 32).storeStringTail(memo).endCell();

    const [payment] = await this.db.insert(payments).values({
      userId: user.userId, amountNanoton: tierConfig.priceNanoton, tier, status: "pending", memo,
      senderAddress: parsed.data.senderAddress, recipientAddress,
    }).returning();

    return {
      paymentId: payment.id, memo,
      transaction: { address: recipientAddress, amount: toNano(tierConfig.priceTon).toString(), payload: cell.toBoc().toString("base64") },
      amount: tierConfig.priceTon, tier,
    };
  }

  @Post("verify-payment")
  async verifyPayment(@Body() body: unknown, @CurrentUser() user: CurrentUserPayload) {
    const parsed = z.object({ paymentId: z.string().uuid() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid input");

    const [payment] = await this.db.select().from(payments).where(and(eq(payments.id, parsed.data.paymentId), eq(payments.userId, user.userId))).limit(1);
    if (!payment || payment.status !== "pending") throw new BadRequestException("Payment not found or already processed");

    await this.db.update(payments).set({ status: "confirmed", confirmedAt: new Date() }).where(eq(payments.id, payment.id));

    // Activate subscription
    await this.activateSubscription(user.userId, payment.tier as Tier, payment.id);
    return { status: "confirmed" };
  }

  private async activateSubscription(userId: string, tier: Tier, paymentId: string) {
    const tierConfig = SUBSCRIPTION_TIERS[tier];
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const existing = await this.db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);

    if (existing.length > 0) {
      const sub = existing[0];
      const startFrom = sub.status === "active" && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
      const newEnd = new Date(startFrom.getTime() + 30 * 24 * 60 * 60 * 1000);
      await this.db.update(subscriptions).set({ tier, status: "active", currentPeriodStart: startFrom === now ? now : sub.currentPeriodStart, currentPeriodEnd: newEnd, graceEndsAt: null, maxAgents: tierConfig.maxAgents, memoryLimitMb: tierConfig.memoryLimitMb, cpuLimit: tierConfig.cpuLimit, updatedAt: now }).where(eq(subscriptions.id, sub.id));
      await this.db.update(payments).set({ subscriptionId: sub.id }).where(eq(payments.id, paymentId));
    } else {
      const [newSub] = await this.db.insert(subscriptions).values({ userId, tier, status: "active", currentPeriodStart: now, currentPeriodEnd: periodEnd, maxAgents: tierConfig.maxAgents, memoryLimitMb: tierConfig.memoryLimitMb, cpuLimit: tierConfig.cpuLimit }).returning();
      await this.db.update(payments).set({ subscriptionId: newSub.id }).where(eq(payments.id, paymentId));
    }
    await this.db.update(agents).set({ trialEndsAt: null, updatedAt: now }).where(eq(agents.userId, userId));
  }

  async checkExpirations() {
    const now = new Date();
    const gracePeriodMs = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

    const expiredActive = await this.db.select().from(subscriptions).where(and(eq(subscriptions.status, "active"), lt(subscriptions.currentPeriodEnd, now)));
    for (const sub of expiredActive) {
      const graceEnd = new Date(sub.currentPeriodEnd.getTime() + gracePeriodMs);
      await this.db.update(subscriptions).set({ status: "past_due", graceEndsAt: graceEnd, updatedAt: now }).where(eq(subscriptions.id, sub.id));
    }

    const expiredGrace = await this.db.select().from(subscriptions).where(and(eq(subscriptions.status, "past_due"), lt(subscriptions.graceEndsAt!, now)));
    for (const sub of expiredGrace) {
      await this.db.update(subscriptions).set({ status: "expired", updatedAt: now }).where(eq(subscriptions.id, sub.id));
      const userAgents = await this.db.select().from(agents).where(and(eq(agents.userId, sub.userId), eq(agents.status, "running")));
      for (const agent of userAgents) {
        if (agent.coolifyAppUuid) { try { await this.coolify.stopApplication(agent.coolifyAppUuid); } catch {} }
        await this.db.update(agents).set({ status: "suspended", updatedAt: new Date() }).where(eq(agents.id, agent.id));
      }
    }
  }
}
