import { NextRequest, NextResponse } from "next/server";
import { confirmPayment } from "@/lib/ton/payment";
import { activateSubscription } from "@/lib/ton/subscription";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { type SubscriptionTier } from "@/lib/constants";
import { z } from "zod";

const schema = z.object({
  paymentId: z.string().uuid(),
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

  const confirmed = await confirmPayment(parsed.data.paymentId, userId);
  if (!confirmed) {
    return NextResponse.json(
      { error: "Payment not found or already processed" },
      { status: 400 },
    );
  }

  // Activate subscription
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, parsed.data.paymentId))
    .limit(1);

  if (payment) {
    await activateSubscription(
      userId,
      payment.tier as SubscriptionTier,
      payment.id,
    );
  }

  return NextResponse.json({ status: "confirmed" });
}
