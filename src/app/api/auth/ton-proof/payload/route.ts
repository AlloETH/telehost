import { NextResponse } from "next/server";
import { generatePayload } from "@/lib/auth/ton-proof";

export async function GET() {
  try {
    const payload = generatePayload();
    return NextResponse.json({ payload });
  } catch (error) {
    console.error("Failed to generate payload:", error);
    return NextResponse.json(
      { error: "Failed to generate payload" },
      { status: 500 },
    );
  }
}
