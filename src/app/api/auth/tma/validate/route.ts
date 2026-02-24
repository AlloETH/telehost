import { NextRequest, NextResponse } from "next/server";
import { validateInitData } from "@/lib/auth/tma";
import { createSessionToken } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SESSION_MAX_AGE = 24 * 60 * 60; // 24 hours

export async function POST(req: NextRequest) {
  try {
    const { initData } = (await req.json()) as { initData: string };

    if (!initData) {
      return NextResponse.json(
        { error: "Missing initData" },
        { status: 400 },
      );
    }

    const result = validateInitData(initData);
    if (!result.valid) {
      return NextResponse.json(
        { error: "Invalid initData", reason: result.reason },
        { status: 401 },
      );
    }

    const { user: tgUser } = result.data;
    const telegramUserId = String(tgUser.id);

    // Find existing user by telegramUserId
    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.telegramUserId, telegramUserId))
      .limit(1);

    let userId: string;
    let walletAddress: string;

    if (existingUsers.length > 0) {
      // Existing user - update last login
      userId = existingUsers[0].id;
      walletAddress = existingUsers[0].walletAddress;
      await db
        .update(users)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, userId));
    } else {
      // New user - create with placeholder wallet address
      const placeholderWallet = `tma_${telegramUserId}`;
      const displayName = [tgUser.first_name, tgUser.last_name]
        .filter(Boolean)
        .join(" ") || undefined;

      const [newUser] = await db
        .insert(users)
        .values({
          walletAddress: placeholderWallet,
          walletAddressRaw: placeholderWallet,
          telegramUserId,
          displayName,
        })
        .returning();

      userId = newUser.id;
      walletAddress = placeholderWallet;
    }

    // Create JWT session
    const token = await createSessionToken({ userId, walletAddress });

    // Set cookie with sameSite: "none" for Telegram WebView iframe
    const response = NextResponse.json({
      success: true,
      userId,
      walletAddress,
      telegramUser: {
        id: tgUser.id,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name,
        username: tgUser.username,
        isPremium: tgUser.is_premium,
        photoUrl: tgUser.photo_url,
      },
    });

    response.cookies.set("telehost_session", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("TMA validate error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
