import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

/** Accepted by every shared function, so they work with `db`, inside a transaction and in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and start the database.");
  // Prepared statements are off because hosted Neon connects through a connection pooler.
  return drizzle({ client: postgres(url, { prepare: false }), schema });
}

// Reuse one connection pool across Next.js hot reloads in development.
const globalForDb = globalThis as unknown as { brightloopDb?: ReturnType<typeof connect> };

export const db = globalForDb.brightloopDb ?? connect();
if (process.env.NODE_ENV !== "production") globalForDb.brightloopDb = db;

export { schema };
