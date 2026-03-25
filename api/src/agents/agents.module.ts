import { Module } from "@nestjs/common";
import { AgentsController } from "./agents.controller";
import { AgentsService } from "./agents.service";
import { CryptoService } from "../crypto/crypto.service";

@Module({
  controllers: [AgentsController],
  providers: [AgentsService, CryptoService],
  exports: [AgentsService],
})
export class AgentsModule {}
