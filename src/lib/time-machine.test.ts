import { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { runBilling } from "./billing";
import { appToday, setClockOffset } from "./clock";
import { addDays } from "./dates";
import { renewSubscription, runLifecycle } from "./lifecycle";
import { jumpToDate, returnToRealDate } from "./time-machine";
import { TransitionError, transitionInvoice } from "./transition";

const { customers, events, invoices, plans, products, subscriptionLines, subscriptions } = schema;

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let db: TestDb;
let customerId: string;
let productId: string;
let counter = 0;

beforeEach(async () => {
  db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [customer] = await db.insert(customers).values({ name: "Acme", email: "a@acme.test" }).returning();
  const [product] = await db.insert(products).values({ name: "Seats", type: "Software", salesPricePaise: 10000 }).returning();
  customerId = customer.id;
  productId = product.id;
});

async function addPlan(overrides: Partial<typeof plans.$inferInsert> = {}) {
  const [plan] = await db.insert(plans).values({ name: "Monthly", pricePaise: 10000, frequency: "monthly", ...overrides }).returning();
  return plan;
}

async function addSubscription(planId: string, overrides: Partial<typeof subscriptions.$inferInsert> = {}) {
  counter += 1;
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      number: `SUB-T${counter}`,
      customerId,
      planId,
      status: "active",
      startDate: "2026-01-15",
      expiryDate: "2026-04-15",
      nextBillingDate: "2026-04-15",
      ...overrides,
    })
    .returning();
  await db.insert(subscriptionLines).values({
    subscriptionId: subscription.id, productId, description: "Seats", quantity: 1, unitPricePaise: 10000,
  });
  return subscription;
}

const reload = async (id: string) => (await db.select().from(subscriptions).where(eq(subscriptions.id, id)))[0];
const invoiceCount = async (id: string) =>
  (await db.select().from(invoices).where(eq(invoices.subscriptionId, id)).orderBy(asc(invoices.periodStart))).length;

describe("runLifecycle", () => {
  it("closes an auto-close plan on its expiry date and records why", async () => {
    const plan = await addPlan({ autoClose: true, canCloseEarly: false });
    const subscription = await addSubscription(plan.id);
    const result = await runLifecycle(db, { today: "2026-04-15" });
    expect(result.closed).toEqual([{ subscriptionId: subscription.id, number: subscription.number }]);
    expect((await reload(subscription.id)).status).toBe("closed");
    const [event] = await db.select().from(events).where(eq(events.entityId, subscription.id));
    expect(event).toMatchObject({ fromStatus: "active", toStatus: "closed", note: "Closed automatically at expiry" });
  });

  it("leaves an auto-close plan alone the day before expiry", async () => {
    const plan = await addPlan({ autoClose: true });
    const subscription = await addSubscription(plan.id);
    const result = await runLifecycle(db, { today: "2026-04-14" });
    expect(result.closed).toEqual([]);
    expect((await reload(subscription.id)).status).toBe("active");
  });

  it("closes a paused auto-close subscription too", async () => {
    const plan = await addPlan({ autoClose: true });
    const subscription = await addSubscription(plan.id, { status: "paused" });
    await runLifecycle(db, { today: "2026-04-15" });
    expect((await reload(subscription.id)).status).toBe("closed");
  });

  it("bills what is still due before closing, so nothing is skipped", async () => {
    const plan = await addPlan({ autoClose: true });
    const subscription = await addSubscription(plan.id, { nextBillingDate: "2026-02-15" });
    const result = await runLifecycle(db, { today: "2026-05-01" });
    expect(await invoiceCount(subscription.id)).toBe(2); // 15 February and 15 March
    expect(result.invoicesCreated).toBe(2);
    expect((await reload(subscription.id)).status).toBe("closed");
  });

  it("lists an expired plan that doesn't auto-close as needing a decision, without closing it", async () => {
    const plan = await addPlan({ autoClose: false });
    const subscription = await addSubscription(plan.id);
    const result = await runLifecycle(db, { today: "2026-04-15" });
    expect(result.needsRenewal).toEqual([{ subscriptionId: subscription.id, number: subscription.number }]);
    expect((await reload(subscription.id)).status).toBe("active");
  });

  it("does nothing new when run again", async () => {
    const plan = await addPlan({ autoClose: true });
    await addSubscription(plan.id);
    await runLifecycle(db, { today: "2026-04-15" });
    const second = await runLifecycle(db, { today: "2026-04-15" });
    expect(second).toMatchObject({ closed: [], invoicesCreated: 0 });
  });

  it("ignores subscriptions with no expiry date", async () => {
    const plan = await addPlan({ autoClose: true });
    const subscription = await addSubscription(plan.id, { expiryDate: null });
    await runLifecycle(db, { today: "2030-01-01" });
    expect((await reload(subscription.id)).status).toBe("active");
  });
});

describe("renewSubscription", () => {
  it("extends by the same length as the current term", async () => {
    const plan = await addPlan();
    const subscription = await addSubscription(plan.id);
    await renewSubscription(db, { id: subscription.id });
    expect((await reload(subscription.id)).expiryDate).toBe("2026-07-15");
  });

  it("keeps the term the same across repeated renewals", async () => {
    const plan = await addPlan();
    const subscription = await addSubscription(plan.id);
    await renewSubscription(db, { id: subscription.id });
    await renewSubscription(db, { id: subscription.id });
    expect((await reload(subscription.id)).expiryDate).toBe("2026-10-15");
  });

  it("restarts billing from the old expiry date when billing had stopped", async () => {
    const plan = await addPlan();
    const subscription = await addSubscription(plan.id);
    await runBilling(db, { today: "2026-04-20" }); // stops billing at expiry
    expect((await reload(subscription.id)).nextBillingDate).toBeNull();
    await renewSubscription(db, { id: subscription.id });
    expect((await reload(subscription.id)).nextBillingDate).toBe("2026-04-15");
    expect((await runBilling(db, { today: "2026-04-20" })).created).toBe(1);
  });

  it("records the renewal on the timeline", async () => {
    const plan = await addPlan();
    const subscription = await addSubscription(plan.id);
    await renewSubscription(db, { id: subscription.id, note: "Customer agreed" });
    const [event] = await db.select().from(events).where(eq(events.entityId, subscription.id));
    expect(event).toMatchObject({ type: "renewed", note: "Customer agreed" });
  });

  it("refuses when the plan doesn't allow renewal", async () => {
    const plan = await addPlan({ canRenew: false });
    const subscription = await addSubscription(plan.id);
    await expect(renewSubscription(db, { id: subscription.id })).rejects.toThrow("This plan can't be renewed.");
  });

  it("refuses a closed subscription", async () => {
    const plan = await addPlan();
    const subscription = await addSubscription(plan.id, { status: "closed" });
    await expect(renewSubscription(db, { id: subscription.id })).rejects.toThrow(TransitionError);
  });

  it("refuses a subscription with no expiry date", async () => {
    const plan = await addPlan();
    const subscription = await addSubscription(plan.id, { expiryDate: null });
    await expect(renewSubscription(db, { id: subscription.id })).rejects.toThrow("This subscription has no expiry date to extend.");
  });
});

describe("jumpToDate", () => {
  it("moves the app to the chosen date", async () => {
    const target = addDays(await appToday(db), 40);
    await jumpToDate(db, { date: target });
    expect(await appToday(db)).toBe(target);
  });

  it("refuses to go backwards, which would make new records older than existing ones", async () => {
    const today = await appToday(db);
    await expect(jumpToDate(db, { date: addDays(today, -1) })).rejects.toThrow("Choose a date after");
    await expect(jumpToDate(db, { date: today })).rejects.toThrow("Choose a date after");
  });

  it("refuses something that isn't a real date", async () => {
    await expect(jumpToDate(db, { date: "2026-02-31" })).rejects.toThrow("isn't a valid date");
    await expect(jumpToDate(db, { date: "soon" })).rejects.toThrow("isn't a valid date");
  });

  it("refuses a jump of more than ten years", async () => {
    await expect(jumpToDate(db, { date: addDays(await appToday(db), 3700) })).rejects.toThrow("no more than 10 years");
  });

  it("closes plans that have ended by the new date", async () => {
    const today = await appToday(db);
    const plan = await addPlan({ autoClose: true });
    const subscription = await addSubscription(plan.id, {
      startDate: today, nextBillingDate: addDays(today, 40), expiryDate: addDays(today, 30),
    });
    const result = await jumpToDate(db, { date: addDays(today, 31) });
    expect(result.closed).toHaveLength(1);
    expect((await reload(subscription.id)).status).toBe("closed");
  });

  it("leaves ordinary billing for the billing run, so billing day can be shown", async () => {
    const today = await appToday(db);
    const plan = await addPlan();
    const subscription = await addSubscription(plan.id, {
      startDate: today, nextBillingDate: addDays(today, 5), expiryDate: null,
    });
    await jumpToDate(db, { date: addDays(today, 10) });
    expect(await invoiceCount(subscription.id)).toBe(0);
  });

  it("counts invoices that became overdue because of the jump", async () => {
    const today = await appToday(db);
    const plan = await addPlan();
    const subscription = await addSubscription(plan.id, { expiryDate: null, startDate: today, nextBillingDate: today });
    const [invoice] = await db.insert(invoices).values({
      number: "INV-X", subscriptionId: subscription.id, customerId, periodStart: today, periodEnd: addDays(today, 30),
      issueDate: today, dueDate: addDays(today, 5), subtotalPaise: 100, totalPaise: 100, breakdown: {},
    }).returning();
    await transitionInvoice(db, { id: invoice.id, to: "confirmed" });
    const result = await jumpToDate(db, { date: addDays(today, 6) });
    expect(result.newlyOverdue).toBe(1);
    expect((await jumpToDate(db, { date: addDays(today, 7) })).newlyOverdue).toBe(0);
  });

  it("writes who moved the clock to the audit trail", async () => {
    const today = await appToday(db);
    const target = addDays(today, 3);
    await jumpToDate(db, { date: target });
    const rows = await db.select().from(events).where(eq(events.type, "time_machine_jump"));
    expect(rows[0]).toMatchObject({ entityType: "system", fromStatus: today, toStatus: target });
  });
});

describe("returnToRealDate", () => {
  it("puts the app back on the real date", async () => {
    const realToday = await appToday(db);
    await setClockOffset(db, 50 * 86_400_000);
    await returnToRealDate(db, {});
    expect(await appToday(db)).toBe(realToday);
  });
});
