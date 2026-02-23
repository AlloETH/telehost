import { NextRequest, NextResponse } from "next/server";
import { verifyPaymentOnChain } from "@/lib/ton/payment";
import { activateSubscription } from "@/lib/ton/subscription";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { type SubscriptionTier } from "@/lib/constants";
import { z } from "zod";

const schema = z.object({
  reference: z.string().min(1),
  txHash: z.string().min(1),
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

  const verified = await verifyPaymentOnChain(
    parsed.data.reference,
    parsed.data.txHash,
  );

  if (!verified) {
    return NextResponse.json(
      { error: "Payment verification failed" },
      { status: 400 },
    );
  }

  // Get the payment to find tier
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.tonpayReference, parsed.data.reference))
    .limit(1);

  if (payment) {
    await activateSubscription(
      userId,
      payment.tier as SubscriptionTier,
      payment.id,
    );
  }

  return NextResponse.json({ success: true, status: "confirmed" });
}
