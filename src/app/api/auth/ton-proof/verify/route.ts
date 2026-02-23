import { NextRequest, NextResponse } from "next/server";
import { verifyTonProof, type WalletInfo } from "@/lib/auth/ton-proof";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { consumeProofPayload } from "@/lib/proof-store";
import { Address } from "@ton/core";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as WalletInfo;

  if (!body.address || !body.proof) {
    return NextResponse.json(
      { error: "Missing address or proof" },
      { status: 400 },
    );
  }

  // Check that the payload was issued by us and hasn't been used
  if (!consumeProofPayload(body.proof.payload)) {
    return NextResponse.json(
      { error: "Invalid or expired payload" },
      { status: 400 },
    );
  }

  // Determine the app domain from the request host
  const host = req.headers.get("host") || req.headers.get("x-forwarded-host") || "localhost";
  const appDomain = host.split(":")[0];

  // Verify the proof
  const result = await verifyTonProof(body, body.proof.payload, appDomain);
  if (!result.valid) {
    console.error("TON proof verification failed:", result.reason);
    return NextResponse.json(
      { error: "Invalid proof", reason: result.reason },
      { status: 401 },
    );
  }

  // Parse wallet address
  const address = Address.parse(body.address);
  const friendlyAddress = address.toString({ bounceable: false });
  const rawAddress = address.toRawString();

  // Upsert user
  const existingUsers = await db
    .select()
    .from(users)
    .where(eq(users.walletAddressRaw, rawAddress))
    .limit(1);

  let userId: string;

  if (existingUsers.length > 0) {
    userId = existingUsers[0].id;
    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
  } else {
    const [newUser] = await db
      .insert(users)
      .values({
        walletAddress: friendlyAddress,
        walletAddressRaw: rawAddress,
      })
      .returning();
    userId = newUser.id;
  }

  // Create session
  const token = await createSessionToken({
    userId,
    walletAddress: friendlyAddress,
  });
  await setSessionCookie(token);

  return NextResponse.json({
    success: true,
    userId,
    walletAddress: friendlyAddress,
  });
}
