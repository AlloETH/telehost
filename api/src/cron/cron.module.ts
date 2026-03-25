import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { CronService } from "./cron.service";
import { BillingModule } from "../billing/billing.module";
@Module({
  imports: [ScheduleModule.forRoot(), BillingModule],
  providers: [CronService],
})
export class CronModule {}
