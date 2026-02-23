import { Address, beginCell, toNano } from "@ton/core";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { SUBSCRIPTION_TIERS, type SubscriptionTier } from "@/lib/constants";

export interface PaymentRequest {
  userId: string;
  tier: SubscriptionTier;
  senderAddress: string;
}

export interface PaymentMessage {
  address: string;
  amount: string;
  payload: string;
}

export interface CreatePaymentResult {
  paymentId: string;
  reference: string;
  message: PaymentMessage;
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

  // Generate unique reference for this payment
  const reference = `TH-${req.userId.slice(0, 8)}-${Date.now()}`;

  // Create payment record
  const [payment] = await db
    .insert(payments)
    .values({
      userId: req.userId,
      amountNanoton: tierConfig.priceNanoton,
      tier: req.tier,
      status: "pending",
      tonpayReference: reference,
      senderAddress: req.senderAddress,
      recipientAddress,
    })
    .returning();

  // Build the TON transfer message with comment for tracking
  const commentCell = beginCell()
    .storeUint(0, 32) // op = 0 (simple transfer with comment)
    .storeStringTail(reference)
    .endCell();

  const message: PaymentMessage = {
    address: recipientAddress,
    amount: toNano(tierConfig.priceTon).toString(),
    payload: commentCell.toBoc().toString("base64"),
  };

  return {
    paymentId: payment.id,
    reference,
    message,
  };
}

export async function verifyPaymentOnChain(
  reference: string,
  txHash: string,
): Promise<boolean> {
  const { eq } = await import("drizzle-orm");

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.tonpayReference, reference))
    .limit(1);

  if (!payment || payment.status !== "pending") {
    return false;
  }

  // Mark as confirmed
  await db
    .update(payments)
    .set({
      status: "confirmed",
      txHash,
      confirmedAt: new Date(),
    })
    .where(eq(payments.id, payment.id));

  return true;
}
