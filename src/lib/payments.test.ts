import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { confirmBankMatch, ignoreBankLine, importBankStatement, pendingBankSuggestions } from "./bank-statements";
import { appToday } from "./clock";
import { addDays } from "./dates";
import { PaymentError, recordPayment } from "./payments";
import { transitionInvoice } from "./transition";

const { bankStatementLines, customers, events, invoices, payments, plans, subscriptions } = schema;
type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let db: TestDb;
let subscriptionId: string;
let customerId: string;
let today: string;
let serial = 0;

beforeEach(async () => {
  db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [customer] = await db.insert(customers).values({ name: "Rao Traders", email: "r@rao.test" }).returning();
  const [plan] = await db.insert(plans).values({ name: "M", pricePaise: 1, frequency: "monthly" }).returning();
  const [subscription] = await db.insert(subscriptions).values({ number: "SUB-1", customerId: customer.id, planId: plan.id, status: "active", startDate: "2026-01-01" }).returning();
  customerId = customer.id;
  subscriptionId = subscription.id;
  today = await appToday(db);
});

async function addInvoice(status: "draft" | "confirmed" = "confirmed", totalPaise = 100000, number?: string) {
  serial += 1;
  const [invoice] = await db.insert(invoices).values({
    number: number ?? `INV-9${String(serial).padStart(4, "0")}`, subscriptionId, customerId, periodStart: `2026-01-${String((serial % 28) + 1).padStart(2, "0")}-`.slice(0, 10),
    periodEnd: "2026-12-31", issueDate: "2026-01-01", dueDate: "2026-12-31", subtotalPaise: totalPaise, totalPaise, breakdown: {},
  }).returning();
  if (status === "confirmed") await transitionInvoice(db, { id: invoice.id, to: "confirmed" });
  return invoice;
}
const reloadInvoice = async (id: string) => (await db.select().from(invoices).where(eq(invoices.id, id)))[0];
const pay = (invoiceId: string, amountPaise: number, overrides = {}) =>
  recordPayment(db, { invoiceId, method: "upi", amountPaise, paidOn: today, note: "Test", ...overrides });

describe("recordPayment", () => {
  it("records a part payment and keeps the balance visible", async () => {
    const invoice = await addInvoice();
    const result = await pay(invoice.id, 40000);
    expect(result).toMatchObject({ status: "confirmed", balancePaise: 60000 });
    expect((await reloadInvoice(invoice.id)).paidPaise).toBe(40000);
    const [payment] = await db.select().from(payments);
    expect(payment).toMatchObject({ method: "upi", amountPaise: 40000, paidOn: today, note: "Test" });
  });

  it("marks the invoice paid once the full amount has come in", async () => {
    const invoice = await addInvoice();
    await pay(invoice.id, 40000);
    const result = await pay(invoice.id, 60000);
    expect(result).toMatchObject({ status: "paid", balancePaise: 0 });
    expect((await reloadInvoice(invoice.id)).status).toBe("paid");
  });

  it("records the payment on the subscription timeline", async () => {
    const invoice = await addInvoice();
    await pay(invoice.id, 40000);
    const [event] = await db.select().from(events).where(eq(events.entityId, subscriptionId));
    expect(event.type).toBe("payment_recorded");
  });

  it("refuses more than the balance", async () => {
    const invoice = await addInvoice();
    await expect(pay(invoice.id, 100001)).rejects.toThrow("more than the ₹1,000.00 left to pay");
    expect(await db.select().from(payments)).toHaveLength(0);
  });

  it("can't overpay through two payments at once", async () => {
    const invoice = await addInvoice();
    const results = await Promise.allSettled([pay(invoice.id, 70000), pay(invoice.id, 70000)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await reloadInvoice(invoice.id)).paidPaise).toBe(70000);
  });

  it("refuses zero, negative and fractional amounts", async () => {
    const invoice = await addInvoice();
    for (const amount of [0, -1, 10.5]) await expect(pay(invoice.id, amount)).rejects.toThrow(PaymentError);
  });

  it("refuses a draft, a paid or a cancelled invoice", async () => {
    const draft = await addInvoice("draft");
    await expect(pay(draft.id, 1)).rejects.toThrow("Confirm this invoice");
    const paid = await addInvoice();
    await pay(paid.id, 100000);
    await expect(pay(paid.id, 1)).rejects.toThrow("already paid");
    const cancelled = await addInvoice();
    await transitionInvoice(db, { id: cancelled.id, to: "cancelled" });
    await expect(pay(cancelled.id, 1)).rejects.toThrow("cancelled");
  });

  it("refuses an invalid or future payment date", async () => {
    const invoice = await addInvoice();
    await expect(pay(invoice.id, 1, { paidOn: "2026-02-31" })).rejects.toThrow("valid date");
    await expect(pay(invoice.id, 1, { paidOn: addDays(today, 1) })).rejects.toThrow("future");
  });

  it("reports a missing invoice", async () => {
    await expect(pay("00000000-0000-0000-0000-000000000000", 1)).rejects.toThrow("Invoice not found");
  });

  it("stops a cancelled invoice after a part payment", async () => {
    const invoice = await addInvoice();
    await pay(invoice.id, 1);
    await expect(transitionInvoice(db, { id: invoice.id, to: "cancelled" })).rejects.toThrow("has payments");
  });
});

const csv = (rows: string) => `Date,Narration,Ref,Credit\n${rows}\n`;

describe("bank statements", () => {
  it("imports credits and reports what it skipped", async () => {
    const result = await importBankStatement(db, { csv: "Date,Narration,Debit,Credit\n2026-10-01,A,,10\n2026-10-01,B,5,\nnope,C,,1\n" });
    expect(result).toMatchObject({ imported: 1, duplicates: 0, debitsSkipped: 1 });
    expect(result.errors).toHaveLength(1);
  });

  it("doesn't import the same statement twice", async () => {
    const file = csv("2026-10-01,A,R1,10\n2026-10-02,B,R2,20");
    await importBankStatement(db, { csv: file });
    const second = await importBankStatement(db, { csv: file });
    expect(second).toMatchObject({ imported: 0, duplicates: 2 });
    expect(await db.select().from(bankStatementLines)).toHaveLength(2);
  });

  it("keeps two identical rows in one statement as separate payments", async () => {
    const result = await importBankStatement(db, { csv: csv("2026-10-01,A,R,10\n2026-10-01,A,R,10") });
    expect(result.imported).toBe(2);
  });

  it("suggests matches for open invoices, using the customer's name", async () => {
    const invoice = await addInvoice("confirmed", 100000, "INV-00042");
    await importBankStatement(db, { csv: csv("2026-10-01,NEFT RAO TRADERS,,1000") });
    const [suggestion] = await pendingBankSuggestions(db);
    expect(suggestion).toMatchObject({ invoiceId: invoice.id, confidence: "high", invoiceNumber: "INV-00042", amountPaise: 100000 });
  });

  it("ignores draft invoices when suggesting", async () => {
    await addInvoice("draft", 100000);
    await importBankStatement(db, { csv: csv("2026-10-01,RAO TRADERS,,1000") });
    expect((await pendingBankSuggestions(db))[0].invoiceId).toBeNull();
  });

  it("records the payment on confirming, and removes the line from pending", async () => {
    const invoice = await addInvoice();
    await importBankStatement(db, { csv: csv("2026-10-01,RAO TRADERS,R9,1000") });
    const [line] = await pendingBankSuggestions(db);
    await confirmBankMatch(db, { lineId: line.lineId, invoiceId: invoice.id });
    expect((await reloadInvoice(invoice.id)).status).toBe("paid");
    const [payment] = await db.select().from(payments);
    expect(payment).toMatchObject({ method: "bank_transfer", paidOn: "2026-10-01", amountPaise: 100000 });
    expect(await pendingBankSuggestions(db)).toEqual([]);
  });

  it("can't confirm the same line twice", async () => {
    const invoice = await addInvoice("confirmed", 300000);
    await importBankStatement(db, { csv: csv("2026-10-01,X,,1000") });
    const [line] = await pendingBankSuggestions(db);
    await confirmBankMatch(db, { lineId: line.lineId, invoiceId: invoice.id });
    await expect(confirmBankMatch(db, { lineId: line.lineId, invoiceId: invoice.id })).rejects.toThrow("already been handled");
    expect((await reloadInvoice(invoice.id)).paidPaise).toBe(100000);
  });

  it("leaves the line pending when the payment is refused", async () => {
    const invoice = await addInvoice("confirmed", 100);
    await importBankStatement(db, { csv: csv("2026-10-01,X,,1000") });
    const [line] = await pendingBankSuggestions(db);
    await expect(confirmBankMatch(db, { lineId: line.lineId, invoiceId: invoice.id })).rejects.toThrow(PaymentError);
    expect(await pendingBankSuggestions(db)).toHaveLength(1);
  });

  it("can set a line aside so it stops appearing", async () => {
    await importBankStatement(db, { csv: csv("2026-10-01,X,,1000") });
    const [line] = await pendingBankSuggestions(db);
    await ignoreBankLine(db, { lineId: line.lineId });
    expect(await pendingBankSuggestions(db)).toEqual([]);
  });
});
