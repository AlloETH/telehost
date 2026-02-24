import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/auth/session";

const SESSION_COOKIE_NAME = "telehost_session";

const PUBLIC_PATHS = [
  "/",
  "/api/auth/ton-proof/payload",
  "/api/auth/ton-proof/verify",
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

  // Only protect /dashboard and /api routes
  if (!pathname.startsWith("/dashboard") && !pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  const session = await verifySessionToken(token);
  if (!session) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Attach user info to headers for downstream use
  const response = NextResponse.next();
  response.headers.set("x-user-id", session.userId);
  response.headers.set("x-wallet-address", session.walletAddress);
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
