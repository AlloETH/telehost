import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/auth/session";

const SESSION_COOKIE_NAME = "telehost_session";

const PUBLIC_PATHS = [
  "/",
  "/api/auth/ton-proof/payload",
  "/api/auth/ton-proof/verify",
  "/api/auth/tma/validate",
  "/api/telegram-bot/webhook",
  "/api/cron",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Only protect /app and /api routes
  if (
    !pathname.startsWith("/app") &&
    !pathname.startsWith("/api")
  ) {
    return NextResponse.next();
  }

  // /app pages: TMA auth happens client-side via AppProvider (sets cookie),
  // desktop auth uses session cookie. Both result in a session cookie.
  // Let the page render — AppProvider handles redirect if no session.
  if (pathname.startsWith("/app")) {
    // If there's a session cookie, inject user ID for server components
    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      const session = await verifySessionToken(token);
      if (session) {
        const requestHeaders = new Headers(req.headers);
        requestHeaders.set("x-user-id", session.userId);
        requestHeaders.set("x-wallet-address", session.walletAddress);
        return NextResponse.next({ request: { headers: requestHeaders } });
      }
    }
    // No cookie yet — let AppProvider handle auth client-side
    return NextResponse.next();
  }

  // API routes require session cookie
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-user-id", session.userId);
  requestHeaders.set("x-wallet-address", session.walletAddress);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/app/:path*", "/api/:path*"],
};
