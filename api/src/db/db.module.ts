import { Global, Module } from "@nestjs/common";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export const DB = Symbol("DB");

export type Db = ReturnType<typeof drizzle<typeof schema>>;

const dbProvider = {
  provide: DB,
  useFactory: () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const client = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    return drizzle(client, { schema });
  },
};

@Global()
@Module({
  providers: [dbProvider],
  exports: [DB],
})
export class DbModule {}
