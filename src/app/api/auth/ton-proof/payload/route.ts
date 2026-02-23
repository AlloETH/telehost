import { NextResponse } from "next/server";
import { generatePayload } from "@/lib/auth/ton-proof";
import { getRedis } from "@/lib/redis";

export async function GET() {
  const payload = generatePayload();

  // Store payload with 5-minute TTL for verification
  await getRedis().set(`ton_proof:${payload}`, "1", "EX", 300);

  return NextResponse.json({ payload });
}
