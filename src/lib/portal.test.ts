import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { runBilling } from "./billing";
import { appToday } from "./clock";
import { addDays } from "./dates";
import {
  applyPortalChange,
  getPortalInvoice,
  getPortalOverview,
  getPortalSubscription,
  listPortalInvoices,
  listPortalPayments,
  listPortalSubscriptions,
  pausePortalSubscription,
  PortalError,
  previewPortalChange,
  resumePortalSubscription,
} from "./portal";
import { recordPayment } from "./payments";
import { transitionInvoice } from "./transition";

const { customers, discountProducts, discounts, events, invoices, plans, productTaxes, products, subscriptionLineTaxes, subscriptionLines, subscriptions, taxRules, user } = schema;
type TestDb = ReturnType<typeof drizzle<typeof schema>>;

let db: TestDb;
let today: string;
let mine: string;
let theirs: string;
let seatProduct: string;
let addon: string;
let notAddon: string;
let monthlyPlan: string;
let taxId: string;
let serial = 0;

beforeEach(async () => {
  db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  today = await appToday(db);
  await db.insert(user).values({ id: "u1", name: "Priya", email: "p@t.test", role: "customer" });
  const [a, b] = await db.insert(customers).values([
    { userId: "u1", name: "Rao Traders", email: "p@t.test" },
    { name: "Other Co", email: "o@t.test" },
  ]).returning();
  mine = a.id;
  theirs = b.id;
  const [tax] = await db.insert(taxRules).values({ name: "GST 18%", rateBps: 1800 }).returning();
  taxId = tax.id;
  const rows = await db.insert(products).values([
    { name: "Suite", type: "Software", salesPricePaise: 100000 },
    { name: "Support", type: "Service", salesPricePaise: 50000, isAddon: true },
    { name: "Other", type: "Software", salesPricePaise: 70000 },
  ]).returning();
  [seatProduct, addon, notAddon] = rows.map((row) => row.id);
  await db.insert(productTaxes).values({ productId: addon, taxRuleId: taxId });
  const [plan] = await db.insert(plans).values({ name: "Monthly", pricePaise: 100000, frequency: "monthly", minQuantity: 2 }).returning();
  monthlyPlan = plan.id;
});

async function addSubscription(customerId: string, overrides: Partial<typeof subscriptions.$inferInsert> = {}, quantity = 3) {
  serial += 1;
  const [row] = await db.insert(subscriptions).values({
    number: `S-${serial}`, customerId, planId: monthlyPlan, status: "active",
    startDate: addDays(today, -5), nextBillingDate: addDays(today, 25), paymentTermsDays: 30, ...overrides,
  }).returning();
  const [line] = await db.insert(subscriptionLines).values({
    subscriptionId: row.id, productId: seatProduct, description: "Suite seats", quantity, unitPricePaise: 100000,
  }).returning();
  return { ...row, lineId: line.id };
}

async function addInvoice(subscriptionId: string, customerId: string, status: "draft" | "confirmed" = "confirmed", dueDate = addDays(today, 10)) {
  serial += 1;
  const [row] = await db.insert(invoices).values({
    number: `I-${serial}`, subscriptionId, customerId, periodStart: addDays(today, -serial), periodEnd: today,
    issueDate: today, dueDate, subtotalPaise: 1000, totalPaise: 1000, breakdown: {},
  }).returning();
  if (status === "confirmed") await transitionInvoice(db, { id: row.id, to: "confirmed" });
  return row;
}

const lineRows = (subscriptionId: string) => db.select().from(subscriptionLines).where(eq(subscriptionLines.subscriptionId, subscriptionId));

describe("a customer only sees their own records", () => {
  it("lists only their subscriptions and hides internal drafts", async () => {
    const own = await addSubscription(mine);
    await addSubscription(mine, { status: "draft" });
    await addSubscription(theirs);
    expect((await listPortalSubscriptions(db, mine)).map((row) => row.id)).toEqual([own.id]);
  });

  it("gives nothing for another customer's subscription", async () => {
    const other = await addSubscription(theirs);
    expect(await getPortalSubscription(db, mine, other.id)).toBeNull();
    await expect(previewPortalChange(db, mine, other.id, {})).rejects.toThrow("Subscription not found.");
    await expect(applyPortalChange(db, { customerId: mine, subscriptionId: other.id, change: {}, expectedTotalPaise: 0, actorId: "u1" })).rejects.toThrow("Subscription not found.");
    await expect(pausePortalSubscription(db, { customerId: mine, subscriptionId: other.id, actorId: "u1" })).rejects.toThrow("Subscription not found.");
    await expect(resumePortalSubscription(db, { customerId: mine, subscriptionId: other.id, actorId: "u1" })).rejects.toThrow("Subscription not found.");
    expect((await db.select().from(subscriptions).where(eq(subscriptions.id, other.id)))[0].status).toBe("active");
  });

  it("gives nothing for another customer's invoice, and hides drafts", async () => {
    const own = await addSubscription(mine);
    const other = await addSubscription(theirs);
    const visible = await addInvoice(own.id, mine);
    const draft = await addInvoice(own.id, mine, "draft");
    const foreign = await addInvoice(other.id, theirs);
    expect((await listPortalInvoices(db, mine)).map((row) => row.id)).toEqual([visible.id]);
    expect(await getPortalInvoice(db, mine, foreign.id)).toBeNull();
    expect(await getPortalInvoice(db, mine, draft.id)).toBeNull();
    expect((await getPortalInvoice(db, mine, visible.id))?.number).toBe(visible.number);
  });

  it("lists only their payments", async () => {
    const own = await addSubscription(mine);
    const other = await addSubscription(theirs);
    await recordPayment(db, { invoiceId: (await addInvoice(own.id, mine)).id, method: "upi", amountPaise: 100, paidOn: today });
    await recordPayment(db, { invoiceId: (await addInvoice(other.id, theirs)).id, method: "upi", amountPaise: 200, paidOn: today });
    expect((await listPortalPayments(db, mine)).map((row) => row.amountPaise)).toEqual([100]);
  });
});

describe("previewPortalChange", () => {
  it("shows the current and new next invoice, saving nothing", async () => {
    const own = await addSubscription(mine);
    const preview = await previewPortalChange(db, mine, own.id, { quantities: { [own.lineId]: 5 } });
    expect(preview.current.totalPaise).toBe(300000);
    expect(preview.next.totalPaise).toBe(500000);
    expect(preview.billingDate).toBe(addDays(today, 25));
    expect((await lineRows(own.id))[0].quantity).toBe(3);
  });

  it("prices an add-on from the product, with its tax", async () => {
    const own = await addSubscription(mine);
    const preview = await previewPortalChange(db, mine, own.id, { addAddons: [addon] });
    expect(preview.next.totalPaise).toBe(300000 + 59000);
  });

  it("uses the same discounts billing will, including a product discount the change unlocks", async () => {
    const own = await addSubscription(mine);
    const [rule] = await db.insert(discounts).values({ name: "10% for 10+", kind: "percent", value: 1000, scope: "product", minQuantity: 10, startsOn: addDays(today, -1), endsOn: addDays(today, 60) }).returning();
    await db.insert(discountProducts).values({ discountId: rule.id, productId: seatProduct });
    const preview = await previewPortalChange(db, mine, own.id, { quantities: { [own.lineId]: 10 } });
    expect(preview.current.discountPaise).toBe(0);
    expect(preview.next.discountPaise).toBe(100000);
  });

  it("refuses too few seats, a product that isn't an add-on, and another subscription's line", async () => {
    const own = await addSubscription(mine);
    const other = await addSubscription(theirs);
    await expect(previewPortalChange(db, mine, own.id, { quantities: { [own.lineId]: 1 } })).rejects.toThrow("at least 2");
    await expect(previewPortalChange(db, mine, own.id, { addAddons: [notAddon] })).rejects.toThrow("isn't an add-on");
    await expect(previewPortalChange(db, mine, own.id, { quantities: { [other.lineId]: 9 } })).rejects.toThrow("isn't on this subscription");
    await expect(previewPortalChange(db, mine, own.id, { removeLines: [own.lineId] })).rejects.toThrow("Only add-ons");
    await expect(previewPortalChange(db, mine, own.id, { quantities: { [own.lineId]: 2.5 } })).rejects.toThrow(PortalError);
  });

  it("refuses a subscription that has stopped or hasn't started", async () => {
    for (const status of ["closed", "quotation", "confirmed"] as const) {
      const own = await addSubscription(mine, { status });
      await expect(previewPortalChange(db, mine, own.id, {})).rejects.toThrow("can't be changed");
    }
  });
});

describe("applyPortalChange", () => {
  const apply = (subscriptionId: string, change: object, expectedTotalPaise: number) =>
    applyPortalChange(db, { customerId: mine, subscriptionId, change, expectedTotalPaise, actorId: "u1" });

  it("saves new seats and writes the timeline", async () => {
    const own = await addSubscription(mine);
    await apply(own.id, { quantities: { [own.lineId]: 5 } }, 500000);
    expect((await lineRows(own.id))[0].quantity).toBe(5);
    const [event] = await db.select().from(events).where(eq(events.type, "customer_changed_plan"));
    expect(event).toMatchObject({ entityId: own.id, actorId: "u1" });
    expect(event.note).toContain("3 to 5");
  });

  it("adds an add-on with its tax, and removes it again", async () => {
    const own = await addSubscription(mine);
    await apply(own.id, { addAddons: [addon] }, 359000);
    const added = (await lineRows(own.id)).find((line) => line.productId === addon)!;
    expect(added).toMatchObject({ quantity: 1, unitPricePaise: 50000, description: "Support" });
    expect(await db.select().from(subscriptionLineTaxes).where(eq(subscriptionLineTaxes.lineId, added.id))).toHaveLength(1);
    await apply(own.id, { removeLines: [added.id] }, 300000);
    expect(await lineRows(own.id)).toHaveLength(1);
  });

  it("refuses an add-on that's already there", async () => {
    const own = await addSubscription(mine);
    await apply(own.id, { addAddons: [addon] }, 359000);
    await expect(previewPortalChange(db, mine, own.id, { addAddons: [addon] })).rejects.toThrow("already");
  });

  it("refuses if the price moved after the customer saw it, saving nothing", async () => {
    const own = await addSubscription(mine);
    await expect(apply(own.id, { quantities: { [own.lineId]: 5 } }, 400000)).rejects.toThrow("price has changed");
    expect((await lineRows(own.id))[0].quantity).toBe(3);
  });

  it("doesn't touch invoices already issued, and the next invoice matches the preview", async () => {
    const own = await addSubscription(mine, { startDate: today, nextBillingDate: today });
    const first = await addInvoice(own.id, mine);
    await apply(own.id, { quantities: { [own.lineId]: 5 } }, 500000);
    expect((await db.select().from(invoices).where(eq(invoices.id, first.id)))[0].totalPaise).toBe(1000);
    const preview = await previewPortalChange(db, mine, own.id, {});
    await runBilling(db, { today });
    const billed = (await db.select().from(invoices).where(eq(invoices.subscriptionId, own.id))).find((row) => row.id !== first.id)!;
    expect(billed.totalPaise).toBe(preview.next.totalPaise);
  });
});

describe("pausing and resuming", () => {
  const input = (subscriptionId: string) => ({ customerId: mine, subscriptionId, actorId: "u1" });

  it("pauses and resumes where the plan allows", async () => {
    const own = await addSubscription(mine);
    await pausePortalSubscription(db, input(own.id));
    expect((await getPortalSubscription(db, mine, own.id))?.status).toBe("paused");
    await resumePortalSubscription(db, input(own.id));
    expect((await getPortalSubscription(db, mine, own.id))?.status).toBe("active");
  });

  it("refuses to pause when the plan doesn't allow it", async () => {
    const [plan] = await db.insert(plans).values({ name: "Fixed", pricePaise: 1, frequency: "monthly", canPause: false }).returning();
    const own = await addSubscription(mine, { planId: plan.id });
    await expect(pausePortalSubscription(db, input(own.id))).rejects.toThrow("doesn't allow pausing");
    expect((await getPortalSubscription(db, mine, own.id))?.canPause).toBe(false);
  });

  it("previews a paused subscription from the date it would resume", async () => {
    const own = await addSubscription(mine, { status: "paused", startDate: addDays(today, -60), nextBillingDate: addDays(today, -30) });
    const detail = await getPortalSubscription(db, mine, own.id);
    expect(detail!.nextInvoice!.billingDate >= today).toBe(true);
  });
});

describe("getPortalOverview", () => {
  it("adds up what the customer owes and what's overdue from their invoices", async () => {
    const own = await addSubscription(mine);
    const other = await addSubscription(theirs);
    await addInvoice(own.id, mine, "confirmed", addDays(today, -3));
    const part = await addInvoice(own.id, mine, "confirmed", addDays(today, 3));
    await recordPayment(db, { invoiceId: part.id, method: "upi", amountPaise: 400, paidOn: today });
    await addInvoice(own.id, mine, "draft");
    await addInvoice(other.id, theirs, "confirmed", addDays(today, -3));
    expect(await getPortalOverview(db, mine)).toMatchObject({ owedPaise: 1600, overduePaise: 1000, overdueCount: 1, today });
  });

  it("is empty for a new customer", async () => {
    expect(await getPortalOverview(db, mine)).toMatchObject({ owedPaise: 0, overduePaise: 0, overdueCount: 0, nextInvoice: null, subscriptions: [] });
  });

  it("picks the soonest upcoming invoice", async () => {
    await addSubscription(mine, { nextBillingDate: addDays(today, 20) });
    const sooner = await addSubscription(mine, { nextBillingDate: addDays(today, 4) });
    expect((await getPortalOverview(db, mine)).nextInvoice).toMatchObject({ subscriptionId: sooner.id, billingDate: addDays(today, 4) });
  });
});
