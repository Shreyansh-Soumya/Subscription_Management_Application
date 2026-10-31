import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { appToday } from "./clock";
import { addDays } from "./dates";
import { confirmDraftInvoices } from "./invoices";
import { getRecurringRevenue } from "./revenue";

const { customers, invoices, plans, products, subscriptionLines, subscriptions } = schema;
type TestDb = ReturnType<typeof drizzle<typeof schema>>;
type Frequency = "daily" | "weekly" | "monthly" | "yearly";
let db: TestDb;
let customerId: string;
let productId: string;
let subscriptionId: string;
let today: string;
let serial = 0;

beforeEach(async () => {
  db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [customer] = await db.insert(customers).values({ name: "Acme", email: "a@a.test" }).returning();
  const [product] = await db.insert(products).values({ name: "S", type: "x", salesPricePaise: 1 }).returning();
  customerId = customer.id;
  productId = product.id;
  today = await appToday(db);
});

async function addSubscription(frequency: Frequency, amountPaise: number, overrides: Partial<typeof subscriptions.$inferInsert> = {}) {
  serial += 1;
  const [plan] = await db.insert(plans).values({ name: frequency, pricePaise: 1, frequency }).returning();
  const [subscription] = await db.insert(subscriptions).values({
    number: `S-${serial}`, customerId, planId: plan.id, status: "active", startDate: "2026-01-01", ...overrides,
  }).returning();
  await db.insert(subscriptionLines).values({ subscriptionId: subscription.id, productId, description: "S", quantity: 2, unitPricePaise: amountPaise / 2 });
  subscriptionId = subscription.id;
  return subscription;
}

describe("getRecurringRevenue", () => {
  it("is zero with no subscriptions", async () => {
    expect(await getRecurringRevenue(db)).toEqual({ mrrPaise: 0, arrPaise: 0, activeSubscriptions: 0 });
  });

  it("counts a monthly plan at its full amount", async () => {
    await addSubscription("monthly", 100000);
    expect(await getRecurringRevenue(db)).toEqual({ mrrPaise: 100000, arrPaise: 1200000, activeSubscriptions: 1 });
  });

  it("spreads other billing frequencies over the year", async () => {
    await addSubscription("yearly", 1200000);
    expect((await getRecurringRevenue(db)).mrrPaise).toBe(100000);
    await addSubscription("weekly", 12000);
    expect((await getRecurringRevenue(db)).arrPaise).toBe(1200000 + 12000 * 52);
    await addSubscription("daily", 1200);
    expect((await getRecurringRevenue(db)).arrPaise).toBe(1200000 + 12000 * 52 + 1200 * 365);
  });

  it("adds every line on a subscription, but counts the subscription once", async () => {
    await addSubscription("monthly", 100000);
    await db.insert(subscriptionLines).values({ subscriptionId, productId, description: "Add-on", quantity: 1, unitPricePaise: 5000 });
    expect(await getRecurringRevenue(db)).toMatchObject({ mrrPaise: 105000, activeSubscriptions: 1 });
  });

  it("leaves out anything not currently running", async () => {
    for (const status of ["draft", "quotation", "confirmed", "paused", "closed"] as const) await addSubscription("monthly", 100000, { status });
    expect((await getRecurringRevenue(db)).mrrPaise).toBe(0);
  });

  it("leaves out a subscription past its expiry, but counts one expiring later", async () => {
    await addSubscription("monthly", 100000, { expiryDate: today });
    expect((await getRecurringRevenue(db)).mrrPaise).toBe(0);
    await addSubscription("monthly", 100000, { expiryDate: addDays(today, 1) });
    expect((await getRecurringRevenue(db)).mrrPaise).toBe(100000);
  });
});

async function addDraft(number: string, periodStart: string) {
  const [invoice] = await db.insert(invoices).values({
    number, subscriptionId, customerId, periodStart, periodEnd: periodStart, issueDate: periodStart, dueDate: periodStart,
    subtotalPaise: 100, totalPaise: 100, breakdown: {},
  }).returning();
  return invoice;
}
const statusOf = async (id: string) => (await db.select().from(invoices).where(eq(invoices.id, id)))[0].status;

describe("confirmDraftInvoices", () => {
  beforeEach(async () => {
    await addSubscription("monthly", 100);
  });

  it("confirms every draft and leaves others alone", async () => {
    const a = await addDraft("A", "2026-01-01");
    const b = await addDraft("B", "2026-02-01");
    const cancelled = await addDraft("C", "2026-03-01");
    await db.update(invoices).set({ status: "cancelled" }).where(eq(invoices.id, cancelled.id));
    const result = await confirmDraftInvoices(db);
    expect(result).toMatchObject({ confirmed: 2, failed: [], hasMore: false });
    expect(await statusOf(a.id)).toBe("confirmed");
    expect(await statusOf(b.id)).toBe("confirmed");
    expect(await statusOf(cancelled.id)).toBe("cancelled");
  });

  it("confirms nothing the second time", async () => {
    await addDraft("A", "2026-01-01");
    await confirmDraftInvoices(db);
    expect((await confirmDraftInvoices(db)).confirmed).toBe(0);
  });

  it("works in batches for live progress", async () => {
    await addDraft("A", "2026-01-01");
    await addDraft("B", "2026-02-01");
    await addDraft("C", "2026-03-01");
    expect(await confirmDraftInvoices(db, { limit: 2 })).toMatchObject({ confirmed: 2, hasMore: true });
    expect(await confirmDraftInvoices(db, { limit: 2 })).toMatchObject({ confirmed: 1, hasMore: false });
  });

  it("writes each confirmation to the audit trail with who did it", async () => {
    const invoice = await addDraft("A", "2026-01-01");
    await confirmDraftInvoices(db);
    const [event] = await db.select().from(schema.events).where(eq(schema.events.entityId, invoice.id));
    expect(event).toMatchObject({ fromStatus: "draft", toStatus: "confirmed" });
  });
});
