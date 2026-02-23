import { mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV5R1 } from "@ton/ton";

export interface WalletData {
  version: "w5r1";
  address: string;
  publicKey: string;
  mnemonic: string[];
  createdAt: string;
}

/**
 * Generate a new TON W5R1 wallet with a 24-word mnemonic.
 * Compatible with teleton-agent's wallet.json format.
 */
export async function generateWallet(): Promise<WalletData> {
  const mnemonic = await mnemonicNew(24);
  const keyPair = await mnemonicToPrivateKey(mnemonic);

  const wallet = WalletContractV5R1.create({
    workchain: 0,
    publicKey: keyPair.publicKey,
  });

  const address = wallet.address.toString({
    bounceable: true,
    testOnly: false,
  });

  return {
    version: "w5r1",
    address,
    publicKey: keyPair.publicKey.toString("hex"),
    mnemonic,
    createdAt: new Date().toISOString(),
  };
}
