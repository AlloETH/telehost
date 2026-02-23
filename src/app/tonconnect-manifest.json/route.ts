import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const host = req.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  return NextResponse.json({
    url: origin,
    name: "Telehost",
    iconUrl: `${origin}/icon.png`,
  });
}
