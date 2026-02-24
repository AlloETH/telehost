import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, createSessionToken } from "@/lib/auth/session";
import {
  verifyTonProof,
  verifyPayloadIntegrity,
  type WalletInfo,
} from "@/lib/auth/ton-proof";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Address } from "@ton/core";

const SESSION_MAX_AGE = 24 * 60 * 60;

export async function POST(req: NextRequest) {
  try {
    // Verify current session
    const token = req.cookies.get("telehost_session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await verifySessionToken(token);
    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = (await req.json()) as WalletInfo;

    if (!body.address || !body.proof) {
      return NextResponse.json(
        { error: "Missing address or proof" },
        { status: 400 },
      );
    }

    // Verify payload integrity
    const payloadCheck = verifyPayloadIntegrity(body.proof.payload);
    if (!payloadCheck.valid) {
      return NextResponse.json(
        { error: "Invalid or expired payload", reason: payloadCheck.reason },
        { status: 400 },
      );
    }

    // Verify TON proof
    const host =
      req.headers.get("host") ||
      req.headers.get("x-forwarded-host") ||
      "localhost";
    const appDomain = host.split(":")[0];

    const result = await verifyTonProof(body, body.proof.payload, appDomain);
    if (!result.valid) {
      return NextResponse.json(
        { error: "Invalid proof", reason: result.reason },
        { status: 401 },
      );
    }

    // Parse wallet address
    const address = Address.parse(body.address);
    const friendlyAddress = address.toString({ bounceable: false });
    const rawAddress = address.toRawString();

    // Check if wallet is already linked to another user
    const existingWalletUser = await db
      .select()
      .from(users)
      .where(eq(users.walletAddressRaw, rawAddress))
      .limit(1);

    if (existingWalletUser.length > 0 && existingWalletUser[0].id !== session.userId) {
      return NextResponse.json(
        { error: "This wallet is already linked to another account" },
        { status: 409 },
      );
    }

    // Update user's wallet address
    await db
      .update(users)
      .set({
        walletAddress: friendlyAddress,
        walletAddressRaw: rawAddress,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.userId));

    // Refresh session token with real wallet address
    const newToken = await createSessionToken({
      userId: session.userId,
      walletAddress: friendlyAddress,
    });

    const response = NextResponse.json({
      success: true,
      walletAddress: friendlyAddress,
    });

    response.cookies.set("telehost_session", newToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("TMA link-wallet error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
