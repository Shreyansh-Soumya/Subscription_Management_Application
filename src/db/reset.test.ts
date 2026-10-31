import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { assertResetAllowed, clearAllData } from "./reset-data";
import * as schema from "./schema";

const hosted = "postgres://u:p@ep-example.neon.tech/neondb";

describe("assertResetAllowed", () => {
  it("allows local databases, including the Docker one", () => {
    for (const url of ["postgres://a:b@localhost/c", "postgres://a:b@127.0.0.1:55440/c", "postgres://a:b@postgres:5432/c"]) {
      expect(() => assertResetAllowed(url, undefined)).not.toThrow();
    }
  });

  it("refuses a hosted database unless its exact hostname is confirmed", () => {
    expect(() => assertResetAllowed(hosted, undefined)).toThrow("RESET_CONFIRM=ep-example.neon.tech");
    expect(() => assertResetAllowed(hosted, "yes")).toThrow("RESET_CONFIRM");
    expect(() => assertResetAllowed(hosted, "ep-example.neon.tech")).not.toThrow();
  });
});

describe("clearAllData", () => {
  it("empties every table but keeps the tables and migration history", async () => {
    const db = drizzle({ client: new PGlite(), schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [customer] = await db.insert(schema.customers).values({ name: "A", email: "a@a.test" }).returning();
    const [plan] = await db.insert(schema.plans).values({ name: "M", pricePaise: 1, frequency: "monthly" }).returning();
    await db.insert(schema.subscriptions).values({ number: "S", customerId: customer.id, planId: plan.id, startDate: "2026-01-01" });
    await db.insert(schema.appClock).values({ id: 1, offsetMs: 5000 });

    await clearAllData(db);

    expect(await db.select().from(schema.customers)).toEqual([]);
    expect(await db.select().from(schema.subscriptions)).toEqual([]);
    expect(await db.select().from(schema.appClock)).toEqual([]);
    const { rows } = await db.execute<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    expect(rows[0].n).toBeGreaterThan(0);
  });
});
