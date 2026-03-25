import { Controller, Get, Post, Delete, Body, Req, Res, Inject, BadRequestException, UnauthorizedException } from "@nestjs/common";
import { Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { createHmac, createHash, randomBytes } from "crypto";
import nacl from "tweetnacl";
import { Address, Cell } from "@ton/core";
import { eq } from "drizzle-orm";
import { DB, type Db } from "../db/db.module";
import { users } from "../db/schema";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";

const SESSION_COOKIE = "telehost_session";
const SESSION_MAX_AGE = 24 * 60 * 60;
const PAYLOAD_TTL = 300;

function getJwtSecret(): Uint8Array { return new TextEncoder().encode(process.env.JWT_SECRET!); }

async function createSessionToken(payload: { userId: string; walletAddress: string }): Promise<string> {
  return new SignJWT(payload as any).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${SESSION_MAX_AGE}s`).sign(getJwtSecret());
}

function setCookie(res: Response, token: string) {
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "none",
    maxAge: SESSION_MAX_AGE * 1000,
    path: "/",
  });
}

@Controller("auth")
export class AuthController {
  constructor(@Inject(DB) private db: Db) {}

  @Get("session")
  getSession(@CurrentUser() user: CurrentUserPayload) {
    return { authenticated: true, userId: user.userId, walletAddress: user.walletAddress };
  }

  @Delete("session")
  logout(@Res() res: Response) {
    res.clearCookie(SESSION_COOKIE);
    res.json({ success: true });
  }

  // --- TMA Validate ---
  @Post("tma/validate")
  @Public()
  async tmaValidate(@Body() body: { initData: string }, @Res() res: Response) {
    if (!body.initData) throw new BadRequestException("Missing initData");

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN not set");

    const params = new URLSearchParams(body.initData);
    const hash = params.get("hash");
    if (!hash) throw new BadRequestException("Missing hash");

    params.delete("hash");
    const entries = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");
    const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
    const computed = createHmac("sha256", secret).update(dataCheckString).digest("hex");

    if (computed !== hash) throw new UnauthorizedException("Invalid initData");

    const authDate = parseInt(params.get("auth_date") || "0", 10);
    if (Math.floor(Date.now() / 1000) - authDate > 300) throw new UnauthorizedException("auth_date expired");

    const userStr = params.get("user");
    if (!userStr) throw new BadRequestException("Missing user");
    const tgUser = JSON.parse(userStr);
    const telegramUserId = String(tgUser.id);

    const existing = await this.db.select().from(users).where(eq(users.telegramUserId, telegramUserId)).limit(1);
    let userId: string, walletAddress: string;

    if (existing.length > 0) {
      userId = existing[0].id;
      walletAddress = existing[0].walletAddress;
      await this.db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
    } else {
      const placeholder = `tma_${telegramUserId}`;
      const displayName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || undefined;
      const [newUser] = await this.db.insert(users).values({ walletAddress: placeholder, walletAddressRaw: placeholder, telegramUserId, displayName }).returning();
      userId = newUser.id;
      walletAddress = placeholder;
    }

    const token = await createSessionToken({ userId, walletAddress });
    setCookie(res, token);
    res.json({ success: true, userId, walletAddress, telegramUser: { id: tgUser.id, firstName: tgUser.first_name, lastName: tgUser.last_name, username: tgUser.username, isPremium: tgUser.is_premium, photoUrl: tgUser.photo_url } });
  }

  // --- TMA Link Wallet ---
  @Post("tma/link-wallet")
  async linkWallet(@Body() body: any, @CurrentUser() user: CurrentUserPayload, @Req() req: Request, @Res() res: Response) {
    if (!body.address || !body.proof) throw new BadRequestException("Missing address or proof");

    const payloadCheck = this.verifyPayloadIntegrity(body.proof.payload);
    if (!payloadCheck.valid) throw new BadRequestException(`Invalid payload: ${payloadCheck.reason}`);

    const host = req.headers.host || req.headers["x-forwarded-host"] as string || "localhost";
    const appDomain = String(host).split(":")[0];
    const proofResult = this.verifyTonProofSync(body, body.proof.payload, appDomain);
    if (!proofResult.valid) throw new UnauthorizedException(`Invalid proof: ${proofResult.reason}`);

    const address = Address.parse(body.address);
    const friendly = address.toString({ bounceable: false });
    const raw = address.toRawString();

    const existingWallet = await this.db.select().from(users).where(eq(users.walletAddressRaw, raw)).limit(1);
    if (existingWallet.length > 0 && existingWallet[0].id !== user.userId) {
      res.status(409).json({ error: "This wallet is already linked to another account" });
      return;
    }

    await this.db.update(users).set({ walletAddress: friendly, walletAddressRaw: raw, updatedAt: new Date() }).where(eq(users.id, user.userId));
    const newToken = await createSessionToken({ userId: user.userId, walletAddress: friendly });
    setCookie(res, newToken);
    res.json({ success: true, walletAddress: friendly });
  }

  // --- TON Proof ---
  @Get("ton-proof/payload")
  @Public()
  getTonPayload() {
    const nonce = randomBytes(16).toString("hex");
    const ts = Math.floor(Date.now() / 1000).toString(16).padStart(8, "0");
    const data = nonce + ts;
    const mac = createHmac("sha256", process.env.JWT_SECRET!).update(data).digest("hex").slice(0, 24);
    return { payload: data + mac };
  }

  @Post("ton-proof/verify")
  @Public()
  async tonProofVerify(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    if (!body.address || !body.proof) throw new BadRequestException("Missing address or proof");

    const payloadCheck = this.verifyPayloadIntegrity(body.proof.payload);
    if (!payloadCheck.valid) { res.status(400).json({ error: "Invalid payload", reason: payloadCheck.reason }); return; }

    const host = req.headers.host || req.headers["x-forwarded-host"] as string || "localhost";
    const appDomain = String(host).split(":")[0];
    const proofResult = this.verifyTonProofSync(body, body.proof.payload, appDomain);
    if (!proofResult.valid) { res.status(401).json({ error: "Invalid proof", reason: proofResult.reason }); return; }

    const address = Address.parse(body.address);
    const friendly = address.toString({ bounceable: false });
    const raw = address.toRawString();

    const existing = await this.db.select().from(users).where(eq(users.walletAddressRaw, raw)).limit(1);
    let userId: string;
    if (existing.length > 0) {
      userId = existing[0].id;
      await this.db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
    } else {
      const [newUser] = await this.db.insert(users).values({ walletAddress: friendly, walletAddressRaw: raw }).returning();
      userId = newUser.id;
    }

    const token = await createSessionToken({ userId, walletAddress: friendly });
    setCookie(res, token);
    res.json({ success: true, userId, walletAddress: friendly });
  }

  // --- Helpers ---
  private verifyPayloadIntegrity(payload: string): { valid: boolean; reason?: string } {
    if (!payload || payload.length !== 64) return { valid: false, reason: "invalid_payload_length" };
    const data = payload.slice(0, 40);
    const mac = payload.slice(40);
    const expected = createHmac("sha256", process.env.JWT_SECRET!).update(data).digest("hex").slice(0, 24);
    if (mac !== expected) return { valid: false, reason: "payload_not_issued_by_server" };
    const ts = parseInt(payload.slice(32, 40), 16);
    if (Math.floor(Date.now() / 1000) - ts > PAYLOAD_TTL) return { valid: false, reason: "payload_expired" };
    return { valid: true };
  }

  private verifyTonProofSync(walletInfo: any, expectedPayload: string, appDomain: string): { valid: boolean; reason?: string } {
    const { address, proof } = walletInfo;
    if (proof.payload !== expectedPayload) return { valid: false, reason: "payload_mismatch" };
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - proof.timestamp) > 900) return { valid: false, reason: "timestamp_expired" };
    // Compare against the frontend domain (from CORS_ORIGIN or APP_DOMAIN), not the API host
    const allowedDomains = (process.env.CORS_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || "").split(",").map((u) => { try { return new URL(u.trim()).hostname; } catch { return u.trim(); } });
    if (allowedDomains.length > 0 && !allowedDomains.includes(proof.domain.value) && proof.domain.value !== appDomain) return { valid: false, reason: "domain_mismatch" };

    let publicKey: Uint8Array | null = walletInfo.publicKey ? Buffer.from(walletInfo.publicKey, "hex") : null;
    if (!publicKey || publicKey.length !== 32) {
      try {
        const cell = Cell.fromBase64(proof.stateInit);
        const slice = cell.beginParse();
        if (slice.loadBit()) slice.loadRef();
        if (slice.loadBit()) slice.loadRef();
        if (slice.loadBit()) slice.loadRef();
        if (!slice.loadBit()) return { valid: false, reason: "no_data_cell" };
        const ds = slice.loadRef().beginParse();
        ds.loadUint(32); ds.loadUint(32);
        publicKey = new Uint8Array(ds.loadBuffer(32));
      } catch { return { valid: false, reason: "pubkey_extraction_failed" }; }
    }

    const parsed = Address.parse(address);
    const wcBuf = Buffer.alloc(4); wcBuf.writeInt32LE(parsed.workChain);
    const domainLenBuf = Buffer.alloc(4); domainLenBuf.writeUInt32LE(proof.domain.lengthBytes);
    const tsBuf = Buffer.alloc(8); tsBuf.writeBigUInt64LE(BigInt(proof.timestamp));
    const msgBuf = Buffer.concat([Buffer.from("ton-proof-item-v2/"), wcBuf, Buffer.from(parsed.hash), domainLenBuf, Buffer.from(proof.domain.value), tsBuf, Buffer.from(proof.payload)]);
    const msgHash = createHash("sha256").update(msgBuf).digest();
    const fullMsg = createHash("sha256").update(Buffer.concat([Buffer.from([0xff, 0xff]), Buffer.from("ton-connect"), msgHash])).digest();

    if (!nacl.sign.detached.verify(fullMsg, Buffer.from(proof.signature, "base64"), publicKey)) return { valid: false, reason: "signature_invalid" };
    return { valid: true };
  }
}
