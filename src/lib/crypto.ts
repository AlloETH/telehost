import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function getEncryptionSecret(): string {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("ENCRYPTION_SECRET environment variable is not set");
  }
  return secret;
}

function deriveKey(salt: Buffer): Buffer {
  return scryptSync(getEncryptionSecret(), salt, KEY_LENGTH);
}

export interface EncryptedData {
  ciphertext: string; // hex
  iv: string; // hex
  tag: string; // hex
  salt: string; // hex
}

export function encrypt(plaintext: string): EncryptedData {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    salt: salt.toString("hex"),
  };
}

export function decrypt(data: EncryptedData): string {
  const salt = Buffer.from(data.salt, "hex");
  const key = deriveKey(salt);
  const iv = Buffer.from(data.iv, "hex");
  const tag = Buffer.from(data.tag, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(data.ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
