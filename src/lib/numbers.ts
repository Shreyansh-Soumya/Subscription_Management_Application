import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import { numberCounters } from "@/db/schema";

/** The next document number, such as "SUB-00042". Safe when several requests run at once. */
export async function nextNumber(db: Db, prefix: "SUB" | "INV"): Promise<string> {
  const [row] = await db
    .insert(numberCounters)
    .values({ prefix, lastValue: 1 })
    .onConflictDoUpdate({
      target: numberCounters.prefix,
      set: { lastValue: sql`${numberCounters.lastValue} + 1` },
    })
    .returning({ value: numberCounters.lastValue });
  return `${prefix}-${String(row.value).padStart(5, "0")}`;
}
