import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DbModule } from "./db/db.module";
import { CoolifyModule } from "./coolify/coolify.module";
import { AuthGuard } from "./common/guards/auth.guard";
import { AgentsModule } from "./agents/agents.module";
import { OpenclawModule } from "./openclaw/openclaw.module";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { CronModule } from "./cron/cron.module";
import { TelegramBotModule } from "./telegram-bot/telegram-bot.module";

@Module({
  imports: [
    DbModule,
    CoolifyModule,
    AgentsModule,
    OpenclawModule,
    AuthModule,
    BillingModule,
    CronModule,
    TelegramBotModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
