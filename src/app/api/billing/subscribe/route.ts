import { NextRequest, NextResponse } from "next/server";
import { createSubscriptionPayment } from "@/lib/ton/payment";
import { type SubscriptionTier, SUBSCRIPTION_TIERS } from "@/lib/constants";
import { z } from "zod";

const schema = z.object({
  tier: z.enum(["basic", "pro", "enterprise"]),
  senderAddress: z.string().min(1),
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

  const tier = parsed.data.tier as SubscriptionTier;
  const tierConfig = SUBSCRIPTION_TIERS[tier];

  try {
    const result = await createSubscriptionPayment({
      userId,
      tier,
      senderAddress: parsed.data.senderAddress,
    });

    return NextResponse.json({
      paymentId: result.paymentId,
      reference: result.reference,
      message: result.message,
      amount: tierConfig.priceTon,
      tier,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
