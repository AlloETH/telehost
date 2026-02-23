import { NextResponse } from "next/server";
import { getSessionFromCookie, clearSessionCookie } from "@/lib/auth/session";

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    userId: session.userId,
    walletAddress: session.walletAddress,
  });
}

export async function DELETE() {
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}
