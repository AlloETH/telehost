import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  integer,
  pgEnum,
  jsonb,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// === ENUMS ===

export const agentStatusEnum = pgEnum("agent_status", [
  "provisioning",
  "awaiting_session",
  "starting",
  "running",
  "stopping",
  "stopped",
  "restarting",
  "deploying",
  "error",
  "suspended",
  "deleting",
]);

export const subscriptionTierEnum = pgEnum("subscription_tier", [
  "basic",
  "pro",
  "enterprise",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "expired",
  "cancelled",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "confirmed",
  "failed",
  "refunded",
]);

export const telegramSessionStatusEnum = pgEnum("telegram_session_status", [
  "none",
  "awaiting_code",
  "awaiting_2fa",
  "active",
  "expired",
]);

// === TABLES ===

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletAddress: varchar("wallet_address", { length: 66 }).notNull(),
    walletAddressRaw: varchar("wallet_address_raw", { length: 66 }).notNull(),
    displayName: varchar("display_name", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    lastLoginAt: timestamp("last_login_at"),
  },
  (table) => [
    uniqueIndex("users_wallet_address_idx").on(table.walletAddress),
    uniqueIndex("users_wallet_address_raw_idx").on(table.walletAddressRaw),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_idx").on(table.token),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    status: agentStatusEnum("status").notNull().default("provisioning"),

    // Coolify integration
    coolifyAppUuid: varchar("coolify_app_uuid", { length: 100 }),
    coolifyDomain: varchar("coolify_domain", { length: 255 }),

    // Encrypted configuration blob (AES-256-GCM)
    configEncrypted: text("config_encrypted").notNull(),
    configIv: varchar("config_iv", { length: 64 }).notNull(),
    configTag: varchar("config_tag", { length: 128 }).notNull(),

    // Telegram session (encrypted)
    telegramSessionEncrypted: text("telegram_session_encrypted"),
    telegramSessionIv: varchar("telegram_session_iv", { length: 64 }),
    telegramSessionTag: varchar("telegram_session_tag", { length: 128 }),
    telegramSessionStatus: telegramSessionStatusEnum(
      "telegram_session_status",
    )
      .notNull()
      .default("none"),

    // WebUI auth token (stored plain - not sensitive like API keys)
    webuiAuthToken: varchar("webui_auth_token", { length: 100 }),

    // TON wallet
    walletAddress: varchar("wallet_address", { length: 100 }),
    walletMnemonicEncrypted: text("wallet_mnemonic_encrypted"),
    walletMnemonicIv: varchar("wallet_mnemonic_iv", { length: 64 }),
    walletMnemonicTag: varchar("wallet_mnemonic_tag", { length: 128 }),

    // Workspace archive (base64-encoded tar.gz, synced from container)
    workspaceArchive: text("workspace_archive"),

    // Trial
    trialEndsAt: timestamp("trial_ends_at"),

    // Metadata
    lastHealthCheck: timestamp("last_health_check"),
    lastError: text("last_error"),
    restartCount: integer("restart_count").notNull().default(0),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    stoppedAt: timestamp("stopped_at"),
  },
  (table) => [
    index("agents_user_id_idx").on(table.userId),
    index("agents_status_idx").on(table.status),
    uniqueIndex("agents_slug_idx").on(table.slug),
    uniqueIndex("agents_coolify_uuid_idx").on(table.coolifyAppUuid),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tier: subscriptionTierEnum("tier").notNull().default("basic"),
    status: subscriptionStatusEnum("status").notNull().default("active"),
    currentPeriodStart: timestamp("current_period_start").notNull(),
    currentPeriodEnd: timestamp("current_period_end").notNull(),
    graceEndsAt: timestamp("grace_ends_at"),
    maxAgents: integer("max_agents").notNull().default(1),
    memoryLimitMb: integer("memory_limit_mb").notNull().default(512),
    cpuLimit: numeric("cpu_limit", { precision: 3, scale: 1 })
      .notNull()
      .default("0.5"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("subscriptions_user_id_idx").on(table.userId),
    index("subscriptions_status_idx").on(table.status),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(
      () => subscriptions.id,
    ),
    amountNanoton: varchar("amount_nanoton", { length: 50 }).notNull(),
    tier: subscriptionTierEnum("tier").notNull(),
    status: paymentStatusEnum("status").notNull().default("pending"),
    memo: varchar("memo", { length: 255 }),
    txHash: varchar("tx_hash", { length: 100 }),
    senderAddress: varchar("sender_address", { length: 66 }).notNull(),
    recipientAddress: varchar("recipient_address", { length: 66 }).notNull(),
    confirmedAt: timestamp("confirmed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("payments_user_id_idx").on(table.userId),
    uniqueIndex("payments_tx_hash_idx").on(table.txHash),
    uniqueIndex("payments_memo_idx").on(table.memo),
    index("payments_status_idx").on(table.status),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    agentId: uuid("agent_id").references(() => agents.id),
    action: varchar("action", { length: 50 }).notNull(),
    metadata: jsonb("metadata"),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_user_id_idx").on(table.userId),
    index("audit_log_action_idx").on(table.action),
    index("audit_log_created_at_idx").on(table.createdAt),
  ],
);

// === TYPE EXPORTS ===

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
