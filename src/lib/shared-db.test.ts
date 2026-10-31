import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { appNow, appToday, getClockState, setClockOffset } from "./clock";
import { nextNumber } from "./numbers";
import { transitionInvoice, transitionSubscription, TransitionError } from "./transition";

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let db: TestDb;
let subscriptionId: string;
let customerId: string;

beforeEach(async () => {
  db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [customer] = await db.insert(schema.customers).values({ name: "Acme", email: "a@acme.test" }).returning();
  const [plan] = await db
    .insert(schema.plans)
    .values({ name: "Monthly", pricePaise: 100000, frequency: "monthly", canPause: false })
    .returning();
  const [subscription] = await db
    .insert(schema.subscriptions)
    .values({ number: "SUB-00001", customerId: customer.id, planId: plan.id, startDate: "2026-10-01" })
    .returning();
  customerId = customer.id;
  subscriptionId = subscription.id;
});

const newInvoice = (status: "draft" | "cancelled" = "draft", number = "INV-1") => ({
  number,
  subscriptionId,
  customerId,
  status,
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  issueDate: "2026-10-01",
  dueDate: "2026-10-31",
  subtotalPaise: 100,
  totalPaise: 100,
  breakdown: {},
});

describe("clock", () => {
  it("runs on real time until the time machine moves it", async () => {
    const before = Date.now();
    const now = await appNow(db);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThan(before + 5000);
  });

  it("moves appNow and appToday after a jump", async () => {
    const realToday = await appToday(db);
    await setClockOffset(db, 40 * 86_400_000);
    const jumped = await appToday(db);
    expect(jumped > realToday).toBe(true);
    await setClockOffset(db, 0);
    expect(await appToday(db)).toBe(realToday);
  });
});

describe("nextNumber", () => {
  it("counts up separately for each prefix", async () => {
    expect(await nextNumber(db, "INV")).toBe("INV-00001");
    expect(await nextNumber(db, "INV")).toBe("INV-00002");
    expect(await nextNumber(db, "SUB")).toBe("SUB-00001");
  });
});

describe("double billing guard", () => {
  it("rejects a second invoice for the same period", async () => {
    await db.insert(schema.invoices).values(newInvoice());
    await expect(db.insert(schema.invoices).values(newInvoice("draft", "INV-2"))).rejects.toThrow();
  });

  it("allows billing a period again after its invoice is cancelled", async () => {
    await db.insert(schema.invoices).values(newInvoice("cancelled"));
    await expect(db.insert(schema.invoices).values(newInvoice("draft", "INV-2"))).resolves.toBeDefined();
  });
});

describe("transitionSubscription", () => {
  it("changes the status and writes a timeline event", async () => {
    await transitionSubscription(db, { id: subscriptionId, to: "quotation", note: "Sent to customer" });
    const [row] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, subscriptionId));
    expect(row.status).toBe("quotation");
    const [event] = await db.select().from(schema.events).where(eq(schema.events.entityId, subscriptionId));
    expect(event).toMatchObject({
      entityType: "subscription",
      type: "status_changed",
      fromStatus: "draft",
      toStatus: "quotation",
      note: "Sent to customer",
    });
  });

  it("rejects a skipped step without changing anything", async () => {
    await expect(transitionSubscription(db, { id: subscriptionId, to: "active" })).rejects.toThrow(TransitionError);
    const [row] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, subscriptionId));
    expect(row.status).toBe("draft");
    expect(await db.select().from(schema.events)).toHaveLength(0);
  });

  it("applies the plan's rules", async () => {
    await db.update(schema.subscriptions).set({ status: "active" }).where(eq(schema.subscriptions.id, subscriptionId));
    await expect(transitionSubscription(db, { id: subscriptionId, to: "paused" })).rejects.toThrow(
      "This plan doesn't allow pausing.",
    );
  });

  it("reports a missing subscription", async () => {
    await expect(
      transitionSubscription(db, { id: "00000000-0000-0000-0000-000000000000", to: "quotation" }),
    ).rejects.toThrow("Subscription not found.");
  });
});

describe("transitionInvoice", () => {
  it("moves an invoice forward and records it", async () => {
    const [invoice] = await db.insert(schema.invoices).values(newInvoice()).returning();
    await transitionInvoice(db, { id: invoice.id, to: "confirmed" });
    const [row] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoice.id));
    expect(row.status).toBe("confirmed");
    expect(await db.select().from(schema.events).where(eq(schema.events.entityId, invoice.id))).toHaveLength(1);
  });

  it("can't be marked paid until the money is recorded", async () => {
    const [invoice] = await db.insert(schema.invoices).values(newInvoice()).returning();
    await transitionInvoice(db, { id: invoice.id, to: "confirmed" });
    await expect(transitionInvoice(db, { id: invoice.id, to: "paid" })).rejects.toThrow("Record the full payment");
  });

  it("rejects paying a draft", async () => {
    const [invoice] = await db.insert(schema.invoices).values(newInvoice()).returning();
    await expect(transitionInvoice(db, { id: invoice.id, to: "paid" })).rejects.toThrow(TransitionError);
  });
});

describe("getClockState", () => {
  it("reports the real date when the clock hasn't moved", async () => {
    expect(await getClockState(db)).toEqual({ isSimulated: false, today: await appToday(db) });
  });

  it("reports the simulated date after a jump", async () => {
    await setClockOffset(db, 40 * 86_400_000);
    expect(await getClockState(db)).toEqual({ isSimulated: true, today: await appToday(db) });
  });
});
