import { NextRequest, NextResponse } from "next/server";
import { getSessionStatus } from "@/lib/telegram/session-manager";

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionKey = req.nextUrl.searchParams.get("sessionKey");
  if (!sessionKey) {
    return NextResponse.json(
      { error: "Missing sessionKey" },
      { status: 400 },
    );
  }

  const status = getSessionStatus(sessionKey);
  if (!status) {
    return NextResponse.json(
      { error: "Session not found or expired" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    status: status.status,
    error: status.error,
    ...(status.sessionString && { sessionString: status.sessionString }),
  });
}
