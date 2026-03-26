ALTER TYPE "public"."agent_status" ADD VALUE 'stopping' BEFORE 'stopped';--> statement-breakpoint
ALTER TYPE "public"."agent_status" ADD VALUE 'restarting' BEFORE 'error';--> statement-breakpoint
ALTER TYPE "public"."agent_status" ADD VALUE 'deploying' BEFORE 'error';--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "trial_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "provisioning_step" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_user_id" varchar(20);--> statement-breakpoint
CREATE UNIQUE INDEX "users_telegram_user_id_idx" ON "users" USING btree ("telegram_user_id");