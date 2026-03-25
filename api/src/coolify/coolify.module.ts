import { Global, Module } from "@nestjs/common";
import { CoolifyService } from "./coolify.service";

@Global()
@Module({
  providers: [CoolifyService],
  exports: [CoolifyService],
})
export class CoolifyModule {}
