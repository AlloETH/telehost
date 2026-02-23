import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

let _db: DbInstance | null = null;

export function getDb(): DbInstance {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const client = postgres(connectionString, { max: 10 });
    _db = drizzle(client, { schema });
  }
  return _db;
}

// Proxy that lazily initializes on first use
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: DbInstance = new Proxy({} as any, {
  get(_, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getDb() as any)[prop];
  },
});
