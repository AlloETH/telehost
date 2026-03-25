import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DbModule } from "./db/db.module";
import { AuthGuard } from "./common/guards/auth.guard";
import { OpenclawModule } from "./openclaw/openclaw.module";
import { AgentsModule } from "./agents/agents.module";

@Module({
  imports: [DbModule, OpenclawModule, AgentsModule],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
