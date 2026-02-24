import { createHmac } from "crypto";

const AUTH_DATE_MAX_AGE_SECONDS = 300; // 5 minutes

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface ValidatedInitData {
  user: TelegramUser;
  auth_date: number;
  hash: string;
  query_id?: string;
  chat_instance?: string;
  chat_type?: string;
  start_param?: string;
}

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN environment variable is not set");
  return token;
}

/**
 * Validate Telegram Mini App initData using HMAC-SHA256.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(
  initData: string,
): { valid: true; data: ValidatedInitData } | { valid: false; reason: string } {
  if (!initData) {
    return { valid: false, reason: "empty_init_data" };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    return { valid: false, reason: "missing_hash" };
  }

  // Build data-check-string: sort all params except hash alphabetically
  params.delete("hash");
  const entries = Array.from(params.entries());
  entries.sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  // secret = HMAC-SHA256("WebAppData", bot_token)
  const secret = createHmac("sha256", "WebAppData")
    .update(getBotToken())
    .digest();

  // computed_hash = HMAC-SHA256(secret, data_check_string)
  const computedHash = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  if (computedHash !== hash) {
    return { valid: false, reason: "hash_mismatch" };
  }

  // Verify auth_date is recent
  const authDateStr = params.get("auth_date");
  if (!authDateStr) {
    return { valid: false, reason: "missing_auth_date" };
  }

  const authDate = parseInt(authDateStr, 10);
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > AUTH_DATE_MAX_AGE_SECONDS) {
    return { valid: false, reason: "auth_date_expired" };
  }

  // Parse user object
  const userStr = params.get("user");
  if (!userStr) {
    return { valid: false, reason: "missing_user" };
  }

  let user: TelegramUser;
  try {
    user = JSON.parse(userStr);
  } catch {
    return { valid: false, reason: "invalid_user_json" };
  }

  if (!user.id) {
    return { valid: false, reason: "missing_user_id" };
  }

  return {
    valid: true,
    data: {
      user,
      auth_date: authDate,
      hash,
      query_id: params.get("query_id") || undefined,
      chat_instance: params.get("chat_instance") || undefined,
      chat_type: params.get("chat_type") || undefined,
      start_param: params.get("start_param") || undefined,
    },
  };
}
