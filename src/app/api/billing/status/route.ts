import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subscriptions, payments } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sub = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  const recentPayments = await db
    .select({
      id: payments.id,
      amountNanoton: payments.amountNanoton,
      tier: payments.tier,
      status: payments.status,
      txHash: payments.txHash,
      confirmedAt: payments.confirmedAt,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.createdAt))
    .limit(10);

  return NextResponse.json({
    subscription: sub.length > 0 ? sub[0] : null,
    payments: recentPayments,
  });
}
