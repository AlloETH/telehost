import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "./session";

const SESSION_COOKIE_NAME = "telehost_session";

export async function withAuth(
  req: NextRequest,
): Promise<{ userId: string; walletAddress: string } | NextResponse> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  return session;
}
