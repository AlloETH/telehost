import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await params;

  const existing = await db
    .select({
      walletAddress: agents.walletAddress,
      walletMnemonicEncrypted: agents.walletMnemonicEncrypted,
      walletMnemonicIv: agents.walletMnemonicIv,
      walletMnemonicTag: agents.walletMnemonicTag,
    })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const agent = existing[0];

  if (!agent.walletMnemonicEncrypted || !agent.walletMnemonicIv || !agent.walletMnemonicTag) {
    return NextResponse.json({ error: "No wallet found" }, { status: 404 });
  }

  // Parse tag:salt format
  const [tag, salt] = agent.walletMnemonicTag.split(":");

  const mnemonic = decrypt({
    ciphertext: agent.walletMnemonicEncrypted,
    iv: agent.walletMnemonicIv,
    tag,
    salt,
  });

  return NextResponse.json({
    address: agent.walletAddress,
    mnemonic: mnemonic.split(" "),
  });
}
