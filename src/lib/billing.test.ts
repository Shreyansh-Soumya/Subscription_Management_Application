import { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { previewNextInvoice, runBilling } from "./billing";
import { transitionSubscription } from "./transition";

const { customers, discounts, discountProducts, events, invoiceLines, invoices, plans, products,
  subscriptionDiscounts, subscriptionLineTaxes, subscriptionLines, subscriptions, taxRules } = schema;

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let db: TestDb;
let customerId: string;
let monthlyPlanId: string;
let productId: string;
let taxId: string;
let counter = 0;

beforeEach(async () => {
  db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [customer] = await db.insert(customers).values({ name: "Acme", email: "a@acme.test" }).returning();
  const [plan] = await db.insert(plans).values({ name: "Monthly", pricePaise: 10000, frequency: "monthly" }).returning();
  const [product] = await db.insert(products).values({ name: "Seats", type: "Software", salesPricePaise: 10000 }).returning();
  const [tax] = await db.insert(taxRules).values({ name: "GST 18%", rateBps: 1800 }).returning();
  customerId = customer.id;
  monthlyPlanId = plan.id;
  productId = product.id;
  taxId = tax.id;
});

async function addSubscription(overrides: Partial<typeof subscriptions.$inferInsert> = {}, quantity = 10) {
  counter += 1;
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      number: `SUB-T${counter}`,
      customerId,
      planId: monthlyPlanId,
      status: "active",
      startDate: "2026-01-31",
      nextBillingDate: "2026-01-31",
      paymentTermsDays: 15,
      ...overrides,
    })
    .returning();
  if (quantity > 0) {
    const [line] = await db
      .insert(subscriptionLines)
      .values({ subscriptionId: subscription.id, productId, description: "Seats", quantity, unitPricePaise: 10000 })
      .returning();
    await db.insert(subscriptionLineTaxes).values({ lineId: line.id, taxRuleId: taxId });
  }
  return subscription;
}

async function addDiscount(overrides: Partial<typeof discounts.$inferInsert> = {}) {
  const [discount] = await db
    .insert(discounts)
    .values({
      name: "10% off",
      kind: "percent",
      value: 1000,
      scope: "subscription",
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
      ...overrides,
    })
    .returning();
  return discount;
}

const invoicesFor = (subscriptionId: string) =>
  db.select().from(invoices).where(eq(invoices.subscriptionId, subscriptionId)).orderBy(asc(invoices.periodStart));

const reload = async (id: string) =>
  (await db.select().from(subscriptions).where(eq(subscriptions.id, id)))[0];

describe("runBilling creating invoices", () => {
  it("creates a draft invoice with customer, period, totals and due date filled in", async () => {
    const subscription = await addSubscription();
    const result = await runBilling(db, { today: "2026-01-31" });

    expect(result.created).toBe(1);
    const [invoice] = await invoicesFor(subscription.id);
    expect(invoice).toMatchObject({
      customerId,
      status: "draft",
      periodStart: "2026-01-31",
      periodEnd: "2026-02-27",
      issueDate: "2026-01-31",
      dueDate: "2026-02-15",
      subtotalPaise: 100000,
      taxPaise: 18000,
      totalPaise: 118000,
    });
    expect(invoice.number).toMatch(/^INV-\d{5}$/);
  });

  it("copies product lines onto the invoice", async () => {
    const subscription = await addSubscription();
    await runBilling(db, { today: "2026-01-31" });
    const [invoice] = await invoicesFor(subscription.id);
    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ productId, description: "Seats", quantity: 10, totalPaise: 118000 });
  });

  it("does not bill a subscription that isn't due yet", async () => {
    const subscription = await addSubscription({ nextBillingDate: "2026-02-01" });
    expect((await runBilling(db, { today: "2026-01-31" })).created).toBe(0);
    expect(await invoicesFor(subscription.id)).toHaveLength(0);
  });

  it("moves the next billing date on, counting from the start date", async () => {
    const subscription = await addSubscription();
    await runBilling(db, { today: "2026-01-31" });
    expect((await reload(subscription.id)).nextBillingDate).toBe("2026-02-28");
    await runBilling(db, { today: "2026-02-28" });
    expect((await reload(subscription.id)).nextBillingDate).toBe("2026-03-31");
  });

  it("records the invoice on the subscription timeline", async () => {
    const subscription = await addSubscription();
    await runBilling(db, { today: "2026-01-31" });
    const [event] = await db.select().from(events).where(eq(events.entityId, subscription.id));
    expect(event.type).toBe("invoice_created");
  });
});

describe("runBilling never bills twice or skips", () => {
  it("creates nothing on a second run for the same day", async () => {
    const subscription = await addSubscription();
    await runBilling(db, { today: "2026-01-31" });
    const second = await runBilling(db, { today: "2026-01-31" });
    expect(second.created).toBe(0);
    expect(await invoicesFor(subscription.id)).toHaveLength(1);
  });

  it("creates only one invoice when two runs overlap", async () => {
    const subscription = await addSubscription();
    await Promise.all([runBilling(db, { today: "2026-01-31" }), runBilling(db, { today: "2026-01-31" })]);
    expect(await invoicesFor(subscription.id)).toHaveLength(1);
  });

  it("bills every missed period when the date jumps ahead", async () => {
    const subscription = await addSubscription();
    const result = await runBilling(db, { today: "2026-04-10" });
    expect(result.created).toBe(3);
    expect((await invoicesFor(subscription.id)).map((i) => i.periodStart)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });

  it("moves on instead of failing when the period already has an invoice", async () => {
    const subscription = await addSubscription();
    await db.insert(invoices).values({
      number: "INV-MANUAL", subscriptionId: subscription.id, customerId, periodStart: "2026-01-31", periodEnd: "2026-02-27",
      issueDate: "2026-01-31", dueDate: "2026-02-15", subtotalPaise: 1, totalPaise: 1, breakdown: {},
    });
    const result = await runBilling(db, { today: "2026-01-31" });
    expect(result.created).toBe(0);
    expect(result.skipped[0].reason).toBe("Already billed for this period");
    expect((await reload(subscription.id)).nextBillingDate).toBe("2026-02-28");
  });
});

describe("runBilling skips", () => {
  it("reports a paused subscription and leaves it unbilled", async () => {
    const subscription = await addSubscription({ status: "paused" });
    const result = await runBilling(db, { today: "2026-01-31" });
    expect(result.created).toBe(0);
    expect(result.skipped).toEqual([{ subscriptionId: subscription.id, number: subscription.number, reason: "Paused" }]);
  });

  it("ignores draft, quotation, confirmed and closed subscriptions", async () => {
    for (const status of ["draft", "quotation", "confirmed", "closed"] as const) await addSubscription({ status });
    const result = await runBilling(db, { today: "2026-01-31" });
    expect(result).toMatchObject({ created: 0, skipped: [] });
  });

  it("reports a subscription with no product lines", async () => {
    await addSubscription({}, 0);
    const result = await runBilling(db, { today: "2026-01-31" });
    expect(result.created).toBe(0);
    expect(result.skipped[0].reason).toBe("No product lines");
  });

  it("stops billing at the expiry date", async () => {
    const subscription = await addSubscription({ expiryDate: "2026-03-31" });
    const result = await runBilling(db, { today: "2026-06-30" });
    expect(result.created).toBe(2);
    expect(result.skipped[0].reason).toBe("Reached expiry date");
    expect((await reload(subscription.id)).nextBillingDate).toBeNull();
  });
});

describe("runBilling discounts", () => {
  it("applies a discount attached to the subscription without anyone asking", async () => {
    const subscription = await addSubscription();
    const discount = await addDiscount();
    await db.insert(subscriptionDiscounts).values({ subscriptionId: subscription.id, discountId: discount.id });
    await runBilling(db, { today: "2026-01-31" });
    const [invoice] = await invoicesFor(subscription.id);
    expect(invoice.discountPaise).toBe(10000);
    expect(invoice.totalPaise).toBe(106200);
  });

  it("applies a product discount to any subscription with that product", async () => {
    const subscription = await addSubscription();
    const discount = await addDiscount({ scope: "product" });
    await db.insert(discountProducts).values({ discountId: discount.id, productId });
    await runBilling(db, { today: "2026-01-31" });
    expect((await invoicesFor(subscription.id))[0].discountPaise).toBe(10000);
  });

  it("doesn't apply a subscription discount that isn't attached", async () => {
    const subscription = await addSubscription();
    await addDiscount();
    await runBilling(db, { today: "2026-01-31" });
    expect((await invoicesFor(subscription.id))[0].discountPaise).toBe(0);
  });

  it("counts each use and stops when the limit runs out", async () => {
    const subscription = await addSubscription();
    const discount = await addDiscount({ usageLimit: 2 });
    await db.insert(subscriptionDiscounts).values({ subscriptionId: subscription.id, discountId: discount.id });
    await runBilling(db, { today: "2026-04-10" });
    expect((await invoicesFor(subscription.id)).map((i) => i.discountPaise)).toEqual([10000, 10000, 0]);
    const [row] = await db.select().from(discounts).where(eq(discounts.id, discount.id));
    expect(row.usageCount).toBe(2);
  });

  it("stops when the discount expires, judged by each invoice's own period", async () => {
    const subscription = await addSubscription();
    const discount = await addDiscount({ endsOn: "2026-02-28" });
    await db.insert(subscriptionDiscounts).values({ subscriptionId: subscription.id, discountId: discount.id });
    await runBilling(db, { today: "2026-04-10" });
    expect((await invoicesFor(subscription.id)).map((i) => i.discountPaise)).toEqual([10000, 10000, 0]);
  });
});

describe("runBilling batches", () => {
  it("processes only the batch size and reports whether more is due", async () => {
    await addSubscription();
    await addSubscription();
    await addSubscription();
    const first = await runBilling(db, { today: "2026-01-31", limit: 2 });
    expect(first).toMatchObject({ processed: 2, created: 2, hasMore: true });
    const second = await runBilling(db, { today: "2026-01-31", limit: 2 });
    expect(second).toMatchObject({ processed: 1, created: 1, hasMore: false });
  });

  it("finishes even when a batch contains only skipped subscriptions", async () => {
    await addSubscription({ status: "paused" });
    await addSubscription({ status: "paused" });
    await addSubscription();
    const seen: number[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i += 1) {
      const result = await runBilling(db, { today: "2026-01-31", limit: 2, cursor });
      seen.push(result.created);
      cursor = result.cursor;
      if (!result.hasMore) break;
    }
    expect(seen.reduce((a, b) => a + b, 0)).toBe(1);
    expect(seen.length).toBeLessThan(5);
  });

  it("totals the amount billed", async () => {
    await addSubscription();
    await addSubscription();
    const result = await runBilling(db, { today: "2026-01-31" });
    expect(result.billedPaise).toBe(236000);
  });
});

describe("previewNextInvoice", () => {
  it("shows the next invoice without creating anything or using a discount", async () => {
    const subscription = await addSubscription();
    const discount = await addDiscount({ usageLimit: 5 });
    await db.insert(subscriptionDiscounts).values({ subscriptionId: subscription.id, discountId: discount.id });

    const preview = await previewNextInvoice(db, subscription.id);

    expect(preview?.billingDate).toBe("2026-01-31");
    expect(preview?.computation.totalPaise).toBe(106200);
    expect(await invoicesFor(subscription.id)).toHaveLength(0);
    const [row] = await db.select().from(discounts).where(eq(discounts.id, discount.id));
    expect(row.usageCount).toBe(0);
  });

  it("returns null when nothing more will be billed", async () => {
    const subscription = await addSubscription({ status: "closed", nextBillingDate: null });
    expect(await previewNextInvoice(db, subscription.id)).toBeNull();
  });
});

describe("billing dates across status changes", () => {
  it("starts billing from the start date when a subscription becomes active", async () => {
    const subscription = await addSubscription({ status: "confirmed", nextBillingDate: null });
    await transitionSubscription(db, { id: subscription.id, to: "active" });
    expect((await reload(subscription.id)).nextBillingDate).toBe("2026-01-31");
  });

  it("doesn't bill the paused months after resuming", async () => {
    const subscription = await addSubscription({ status: "paused", startDate: "2020-01-15", nextBillingDate: "2020-02-15" });
    await transitionSubscription(db, { id: subscription.id, to: "active" });
    const next = (await reload(subscription.id)).nextBillingDate;
    const today = new Date().toISOString().slice(0, 10);
    expect(next! >= addDaysBack(today)).toBe(true);
    expect(next!.endsWith("-15")).toBe(true);
  });
});

function addDaysBack(day: string) {
  const moment = new Date(`${day}T00:00:00Z`);
  moment.setUTCDate(moment.getUTCDate() - 1);
  return moment.toISOString().slice(0, 10);
}
