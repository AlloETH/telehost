import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { activateSubscription } from "@/lib/ton/subscription";
import { type SubscriptionTier } from "@/lib/constants";

function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return expected === signature;
}

export async function POST(req: NextRequest) {
  const secret = process.env.TONPAY_API_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 },
    );
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-tonpay-signature") || "";

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 },
    );
  }

  const body = JSON.parse(rawBody);

  // Only process successful transfers
  if (body.data?.status !== "success") {
    return NextResponse.json({ received: true });
  }

  const reference = body.data?.reference;
  if (!reference) {
    return NextResponse.json({ received: true });
  }

  // Look up payment by reference
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.tonpayReference, reference))
    .limit(1);

  if (!payment || payment.status !== "pending") {
    return NextResponse.json({ received: true });
  }

  // Confirm payment
  await db
    .update(payments)
    .set({
      status: "confirmed",
      txHash: body.data.txHash,
      confirmedAt: new Date(),
    })
    .where(eq(payments.id, payment.id));

  // Activate subscription
  await activateSubscription(
    payment.userId,
    payment.tier as SubscriptionTier,
    payment.id,
  );

  return NextResponse.json({ received: true });
}
