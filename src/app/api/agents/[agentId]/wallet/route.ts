import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { encrypt } from "@/lib/crypto";
import { generateWallet } from "@/lib/ton/wallet";
import { getCoolifyClient } from "@/lib/coolify/client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await params;

  const existing = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const agent = existing[0];

  if (agent.walletAddress) {
    return NextResponse.json(
      { error: "Agent already has a wallet" },
      { status: 409 },
    );
  }

  // Generate wallet
  const wallet = await generateWallet();
  const walletJson = JSON.stringify(wallet, null, 2);
  const walletB64 = Buffer.from(walletJson).toString("base64");

  // Encrypt mnemonic for DB storage
  const encryptedMnemonic = encrypt(wallet.mnemonic.join(" "));

  await db
    .update(agents)
    .set({
      walletAddress: wallet.address,
      walletMnemonicEncrypted: encryptedMnemonic.ciphertext,
      walletMnemonicIv: encryptedMnemonic.iv,
      walletMnemonicTag: encryptedMnemonic.tag + ":" + encryptedMnemonic.salt,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId));

  // Inject wallet into Coolify container
  if (agent.coolifyAppUuid) {
    const coolify = getCoolifyClient();
    await coolify.setEnvVar(agent.coolifyAppUuid, {
      key: "TELETON_WALLET_B64",
      value: walletB64,
      is_literal: true,
      is_shown_once: true,
    });

    // Redeploy so container picks up the new env var
    await coolify.deployApp(agent.coolifyAppUuid);
  }

  return NextResponse.json({
    address: wallet.address,
    mnemonic: wallet.mnemonic,
  });
}
