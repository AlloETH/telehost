import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { CryptoService } from "../crypto/crypto.service";

@Module({
  controllers: [AuthController],
  providers: [CryptoService],
})
export class AuthModule {}
