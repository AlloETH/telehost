import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") || [
      "http://localhost:3000",
      "http://localhost:3001",
    ],
    credentials: true,
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`[api] listening on http://0.0.0.0:${port}`);
}
bootstrap();
