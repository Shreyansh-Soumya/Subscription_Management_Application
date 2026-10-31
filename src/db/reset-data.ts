import { sql } from "drizzle-orm";
import type { Db } from "./index";
import { isLocalDatabase } from "./seed-password";

/** Wiping data can't be undone, so a hosted database needs its exact hostname typed out. */
export function assertResetAllowed(databaseUrl: string, confirmation: string | undefined): void {
  if (isLocalDatabase(databaseUrl)) return;
  const { hostname } = new URL(databaseUrl);
  if (confirmation !== hostname) {
    throw new Error(`This deletes all data on a hosted database. To continue, set RESET_CONFIRM=${hostname}`);
  }
}

/** Empties every app table, including logins. The tables and migration history stay. */
export async function clearAllData(db: Db): Promise<void> {
  await db.execute(sql`
    do $$
    declare tables text;
    begin
      select string_agg(format('%I.%I', schemaname, tablename), ', ') into tables
      from pg_tables where schemaname = 'public';
      if tables is not null then
        execute 'truncate table ' || tables || ' restart identity cascade';
      end if;
    end $$;
  `);
}
