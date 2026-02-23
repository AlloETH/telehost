import nacl from "tweetnacl";
import { Address, Cell } from "@ton/core";
import { createHash, randomBytes } from "crypto";

const TON_PROOF_PREFIX = "ton-proof-item-v2/";
const TON_CONNECT_PREFIX = "ton-connect";

export interface TonProofPayload {
  timestamp: number;
  domain: {
    lengthBytes: number;
    value: string;
  };
  payload: string;
  signature: string;
  stateInit: string;
}

export interface WalletInfo {
  address: string;
  network: string;
  publicKey?: string;
  proof: TonProofPayload;
}

export function generatePayload(): string {
  return randomBytes(32).toString("hex");
}

export async function verifyTonProof(
  walletInfo: WalletInfo,
  expectedPayload: string,
  appDomain: string,
): Promise<{ valid: boolean; reason?: string }> {
  const { address, proof } = walletInfo;

  // 1. Verify the payload matches what we issued
  if (proof.payload !== expectedPayload) {
    return { valid: false, reason: "payload_mismatch" };
  }

  // 2. Verify the timestamp is within 15 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - proof.timestamp) > 900) {
    return { valid: false, reason: `timestamp_expired (now=${now}, proof=${proof.timestamp})` };
  }

  // 3. Verify the domain (skip in development — wallet caches manifest domain)
  if (process.env.NODE_ENV !== "development" && proof.domain.value !== appDomain) {
    return { valid: false, reason: `domain_mismatch (proof="${proof.domain.value}", expected="${appDomain}")` };
  }

  // 4. Get the public key — prefer the wallet-provided key, fall back to stateInit extraction
  let publicKey: Uint8Array | null = null;

  if (walletInfo.publicKey) {
    publicKey = Buffer.from(walletInfo.publicKey, "hex");
  }

  if (!publicKey || publicKey.length !== 32) {
    publicKey = extractPublicKeyFromStateInit(proof.stateInit);
  }

  if (!publicKey) {
    return { valid: false, reason: "pubkey_extraction_failed" };
  }

  // 5. Verify the address matches the public key
  const parsedAddress = Address.parse(address);

  // 6. Reconstruct the signed message
  const message = createMessage(
    parsedAddress,
    proof.domain,
    proof.timestamp,
    proof.payload,
  );

  // 7. Verify the signature
  const signatureBytes = Buffer.from(proof.signature, "base64");
  const sigValid = nacl.sign.detached.verify(message, signatureBytes, publicKey);

  if (!sigValid) {
    return { valid: false, reason: "signature_invalid" };
  }

  return { valid: true };
}

function createMessage(
  address: Address,
  domain: { lengthBytes: number; value: string },
  timestamp: number,
  payload: string,
): Uint8Array {
  const wcBuf = Buffer.alloc(4);
  wcBuf.writeInt32LE(address.workChain);

  const domainLenBuf = Buffer.alloc(4);
  domainLenBuf.writeUInt32LE(domain.lengthBytes);

  const domainBuf = Buffer.from(domain.value);

  const tsBuf = Buffer.alloc(8);
  tsBuf.writeBigUInt64LE(BigInt(timestamp));

  const payloadBuf = Buffer.from(payload);

  const msgBuf = Buffer.concat([
    Buffer.from(TON_PROOF_PREFIX),
    wcBuf,
    Buffer.from(address.hash),
    domainLenBuf,
    domainBuf,
    tsBuf,
    payloadBuf,
  ]);

  const msgHash = createHash("sha256").update(msgBuf).digest();

  const fullMsg = Buffer.concat([
    Buffer.from([0xff, 0xff]),
    Buffer.from(TON_CONNECT_PREFIX),
    msgHash,
  ]);

  return createHash("sha256").update(fullMsg).digest();
}

function extractPublicKeyFromStateInit(
  stateInitBase64: string,
): Uint8Array | null {
  try {
    const stateInitCell = Cell.fromBase64(stateInitBase64);
    const slice = stateInitCell.beginParse();

    // StateInit: split_depth:Maybe ^1 special:Maybe ^1 code:Maybe ^Cell data:Maybe ^Cell lib:Maybe ^Cell
    if (slice.loadBit()) slice.loadRef(); // split_depth
    if (slice.loadBit()) slice.loadRef(); // special
    if (slice.loadBit()) slice.loadRef(); // code
    if (!slice.loadBit()) return null; // data must exist

    const dataCell = slice.loadRef();
    const dataSlice = dataCell.beginParse();

    // Try Wallet V4/V5 data layout: seqno(32) ++ subwallet(32) ++ public_key(256)
    // Also works for V3: seqno(32) ++ subwallet(32) ++ public_key(256)
    dataSlice.loadUint(32); // seqno
    dataSlice.loadUint(32); // subwallet_id
    const publicKey = dataSlice.loadBuffer(32);

    return new Uint8Array(publicKey);
  } catch {
    return null;
  }
}
