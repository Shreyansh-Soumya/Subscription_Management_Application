import { PGlite } from "@electric-sql/pglite";
import { count, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { runBilling } from "../lib/billing";
import { addDays } from "../lib/dates";
import { appToday } from "../lib/clock";
import { nextNumber } from "../lib/numbers";
import { bigSeedSpec, loadBigSeed } from "./big-seed-data";
import * as schema from "./schema";

const { invoices, payments, plans, products, subscriptionLines, subscriptions, taxRules } = schema;
type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let db: TestDb;

beforeEach(async () => {
  db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(plans).values([
    { name: "Monthly", pricePaise: 120000, frequency: "monthly" },
    { name: "Yearly", pricePaise: 1200000, frequency: "yearly", minQuantity: 5 },
  ]);
  await db.insert(products).values({ name: "Brightloop Suite", type: "Software", salesPricePaise: 120000 });
  await db.insert(taxRules).values({ name: "GST 18%", rateBps: 1800 });
});

describe("loadBigSeed", () => {
  it("adds subscriptions due tomorrow, each with a line and a past invoice", async () => {
    const today = await appToday(db);
    const result = await loadBigSeed(db, 120);
    expect(result.billingDate).toBe(addDays(today, 1));
    expect((await db.select({ n: count() }).from(subscriptions))[0].n).toBe(120);
    expect((await db.select({ n: count() }).from(subscriptionLines))[0].n).toBe(120);
    expect((await db.select({ n: count() }).from(invoices))[0].n).toBe(120);
    const due = await db.select({ n: count() }).from(subscriptions).where(eq(subscriptions.nextBillingDate, result.billingDate));
    expect(due[0].n).toBe(120);
  });

  it("meets each plan's minimum seats", () => {
    for (let index = 0; index < 500; index += 1) {
      const spec = bigSeedSpec(index);
      if (spec.isYearly) expect(spec.seats).toBeGreaterThanOrEqual(5);
      expect(spec.seats).toBeGreaterThanOrEqual(1);
    }
  });

  it("has paid, open and overdue invoices, and payments only for the paid ones", async () => {
    const today = await appToday(db);
    await loadBigSeed(db, 200);
    const rows = await db.select().from(invoices);
    const paid = rows.filter((row) => row.status === "paid");
    const overdue = rows.filter((row) => row.status === "confirmed" && row.dueDate < today);
    const open = rows.filter((row) => row.status === "confirmed" && row.dueDate >= today);
    expect(paid.length).toBeGreaterThan(0);
    expect(overdue.length).toBeGreaterThan(0);
    expect(open.length).toBeGreaterThan(0);
    expect((await db.select({ n: count() }).from(payments))[0].n).toBe(paid.length);
    const [{ sum }] = await db.select({ sum: sql<number>`sum(${payments.amountPaise})`.mapWith(Number) }).from(payments);
    expect(sum).toBe(paid.reduce((total, row) => total + row.totalPaise, 0));
  });

  it("bills cleanly the next day, with no number clashes", async () => {
    const before = await nextNumber(db, "INV");
    const { billingDate } = await loadBigSeed(db, 120);
    const result = await runBilling(db, { today: billingDate });
    const paused = Array.from({ length: 120 }, (_, index) => bigSeedSpec(index)).filter((spec) => spec.status === "paused").length;
    expect(result.failed).toEqual([]);
    expect(result.created).toBe(120 - paused);
    expect(result.skipped).toHaveLength(paused);
    const rows = await db.select({ number: invoices.number }).from(invoices);
    expect(new Set(rows.map((row) => row.number)).size).toBe(rows.length);
    expect(rows.map((row) => row.number)).not.toContain(before);
  });

  it("refuses to run twice", async () => {
    await loadBigSeed(db, 5);
    await expect(loadBigSeed(db, 5)).rejects.toThrow("already loaded");
  });
});
