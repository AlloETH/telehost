import { Module } from "@nestjs/common";
import { BillingController } from "./billing.controller";

@Module({
  controllers: [BillingController],
  providers: [BillingController],
  exports: [BillingController],
})
export class BillingModule {}
