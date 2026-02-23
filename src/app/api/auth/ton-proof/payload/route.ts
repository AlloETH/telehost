import { NextResponse } from "next/server";
import { generatePayload } from "@/lib/auth/ton-proof";
import { setProofPayload } from "@/lib/proof-store";

export async function GET() {
  const payload = generatePayload();
  setProofPayload(payload);
  return NextResponse.json({ payload });
}
