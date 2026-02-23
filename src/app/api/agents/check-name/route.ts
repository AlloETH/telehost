import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nameToSlug } from "@/lib/agents/slug";

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const slug = nameToSlug(name);
  if (!slug) {
    return NextResponse.json({
      available: false,
      slug: "",
      reason: "Name must contain at least one letter or number",
    });
  }

  const existing = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.slug, slug))
    .limit(1);

  return NextResponse.json({
    available: existing.length === 0,
    slug,
    domain: `${slug}.${process.env.AGENT_BASE_DOMAIN || "localhost"}`,
  });
}
