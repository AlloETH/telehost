import { beginCell, toNano } from "@ton/core";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { SUBSCRIPTION_TIERS, type SubscriptionTier } from "@/lib/constants";

export interface PaymentRequest {
  userId: string;
  tier: SubscriptionTier;
  senderAddress: string;
}

export interface CreatePaymentResult {
  paymentId: string;
  memo: string;
  transaction: {
    address: string;
    amount: string;
    payload: string;
  };
}

export async function createSubscriptionPayment(
  req: PaymentRequest,
): Promise<CreatePaymentResult> {
  const tierConfig = SUBSCRIPTION_TIERS[req.tier];
  if (!tierConfig) {
    throw new Error("Invalid tier selected");
  }

  const recipientAddress = process.env.TON_SERVICE_WALLET_ADDRESS;
  if (!recipientAddress) {
    throw new Error("TON_SERVICE_WALLET_ADDRESS is not configured");
  }

  // Generate unique memo for tracking
  const memo = `TH-${req.userId.slice(0, 8)}-${Date.now()}`;

  // Build TON transfer message with comment memo
  const body = beginCell()
    .storeUint(0, 32) // op = 0 (simple transfer with comment)
    .storeStringTail(memo)
    .endCell();

  const [payment] = await db
    .insert(payments)
    .values({
      userId: req.userId,
      amountNanoton: tierConfig.priceNanoton,
      tier: req.tier,
      status: "pending",
      memo,
      senderAddress: req.senderAddress,
      recipientAddress,
    })
    .returning();

  return {
    paymentId: payment.id,
    memo,
    transaction: {
      address: recipientAddress,
      amount: toNano(tierConfig.priceTon).toString(),
      payload: body.toBoc().toString("base64"),
    },
  };
}

export async function confirmPayment(
  paymentId: string,
  userId: string,
): Promise<boolean> {
  const { eq, and } = await import("drizzle-orm");

  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.userId, userId)))
    .limit(1);

  if (!payment || payment.status !== "pending") {
    return false;
  }

  await db
    .update(payments)
    .set({
      status: "confirmed",
      confirmedAt: new Date(),
    })
    .where(eq(payments.id, payment.id));

  return true;
}
