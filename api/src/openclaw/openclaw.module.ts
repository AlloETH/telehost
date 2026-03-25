import { Module } from "@nestjs/common";
import { OpenclawService } from "./openclaw.service";
import { SessionsController } from "./sessions.controller";
import { ChatController } from "./chat.controller";
import { CryptoService } from "../crypto/crypto.service";

@Module({
  controllers: [SessionsController, ChatController],
  providers: [OpenclawService, CryptoService],
  exports: [OpenclawService],
})
export class OpenclawModule {}
