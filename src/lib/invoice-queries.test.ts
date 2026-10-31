import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { appToday } from "./clock";
import { addDays } from "./dates";
import { invoiceSummary, listInvoices, listPayments, resolveInvoiceRef } from "./invoice-queries";

const { customers, invoices, payments, plans, subscriptions } = schema;
type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let db: TestDb;
let customerId: string;
let subscriptionId: string;
let today: string;
let serial = 0;

beforeEach(async () => {
  db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [customer] = await db.insert(customers).values({ name: "Rao Traders", email: "rao@brightloop.test" }).returning();
  const [plan] = await db.insert(plans).values({ name: "M", pricePaise: 1, frequency: "monthly" }).returning();
  const [subscription] = await db.insert(subscriptions).values({ number: "SUB-1", customerId: customer.id, planId: plan.id, status: "active", startDate: "2026-01-01" }).returning();
  customerId = customer.id;
  subscriptionId = subscription.id;
  today = await appToday(db);
});

type SeedStatus = "draft" | "confirmed" | "paid" | "cancelled";

async function addInvoice(
  options: { status?: SeedStatus; dueDate?: string; totalPaise?: number; paidPaise?: number; number?: string } = {},
) {
  serial += 1;
  const status = options.status ?? "confirmed";
  const totalPaise = options.totalPaise ?? 100000;
  const [invoice] = await db.insert(invoices).values({
    number: options.number ?? `INV-Q${String(serial).padStart(4, "0")}`,
    subscriptionId,
    customerId,
    // Distinct billing period per invoice — one non-cancelled invoice per
    // (subscription, period) is enforced by invoices_one_per_period.
    periodStart: addDays("2026-01-01", serial),
    periodEnd: addDays("2026-02-01", serial),
    issueDate: "2026-01-01",
    dueDate: options.dueDate ?? addDays(today, 10),
    subtotalPaise: totalPaise,
    totalPaise,
    paidPaise: options.paidPaise ?? 0,
    status,
    breakdown: {},
  }).returning();
  return invoice;
}

async function addPayment(
  invoiceId: string,
  options: { paidOn?: string; createdAt?: Date; amountPaise?: number } = {},
) {
  const [payment] = await db.insert(payments).values({
    invoiceId,
    method: "upi",
    amountPaise: options.amountPaise ?? 10000,
    paidOn: options.paidOn ?? today,
    note: "Ledger test",
    createdAt: options.createdAt,
  }).returning();
  return payment;
}

describe("listInvoices", () => {
  it("splits open invoices into mutually exclusive outstanding and overdue views", async () => {
    const overdue = await addInvoice({ dueDate: addDays(today, -10) });
    const dueToday = await addInvoice({ dueDate: today });
    const future = await addInvoice({ dueDate: addDays(today, 10) });
    const partPaidOverdue = await addInvoice({ dueDate: addDays(today, -3), paidPaise: 40000 });

    const outstanding = await listInvoices(db, { view: "outstanding" });
    const overdueRows = await listInvoices(db, { view: "overdue" });

    expect(outstanding.rows.map((r) => r.invoiceId).sort()).toEqual([dueToday.id, future.id].sort());
    expect(overdueRows.rows.map((r) => r.invoiceId).sort()).toEqual([overdue.id, partPaidOverdue.id].sort());

    const outstandingIds = new Set(outstanding.rows.map((r) => r.invoiceId));
    for (const row of overdueRows.rows) expect(outstandingIds.has(row.invoiceId)).toBe(false);

    const partPaid = overdueRows.rows.find((r) => r.invoiceId === partPaidOverdue.id);
    expect(partPaid).toMatchObject({ paidPaise: 40000, balancePaise: 60000, status: "confirmed" });
  });

  it("excludes paid, draft and cancelled invoices from the open views", async () => {
    const paid = await addInvoice({ status: "paid", paidPaise: 100000 });
    await addInvoice({ status: "draft" });
    await addInvoice({ status: "cancelled" });

    expect((await listInvoices(db, { view: "outstanding" })).total).toBe(0);
    expect((await listInvoices(db, { view: "overdue" })).total).toBe(0);

    const paidList = await listInvoices(db, { view: "paid" });
    expect(paidList.rows.map((r) => r.invoiceId)).toEqual([paid.id]);
  });

  it("orders overdue invoices oldest due date first", async () => {
    const latest = await addInvoice({ dueDate: addDays(today, -1) });
    const earliest = await addInvoice({ dueDate: addDays(today, -5) });
    const rows = (await listInvoices(db, { view: "overdue" })).rows;
    expect(rows.map((r) => r.invoiceId)).toEqual([earliest.id, latest.id]);
  });

  it("paginates with an exact total", async () => {
    for (let i = 0; i < 30; i += 1) await addInvoice({ dueDate: addDays(today, 10) });
    const firstPage = await listInvoices(db, { view: "outstanding" });
    expect(firstPage).toMatchObject({ total: 30, page: 1, pageCount: 2 });
    expect(firstPage.rows).toHaveLength(25);
    const secondPage = await listInvoices(db, { view: "outstanding", page: 2 });
    expect(secondPage.rows).toHaveLength(5);
    const beyond = await listInvoices(db, { view: "outstanding", page: 9 });
    expect(beyond.rows).toHaveLength(0);
  });

  it("searches by invoice number and customer name", async () => {
    await addInvoice({ number: "INV-SEARCH-1" });
    await addInvoice({ dueDate: addDays(today, 11) });
    const byNumber = await listInvoices(db, { view: "outstanding", q: "SEARCH" });
    expect(byNumber.rows.map((r) => r.number)).toEqual(["INV-SEARCH-1"]);
    const byCustomer = await listInvoices(db, { view: "outstanding", q: "Rao" });
    expect(byCustomer.total).toBe(2);
  });

  it("rejects invalid page inputs instead of producing an unsafe offset", async () => {
    for (const page of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 2.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(listInvoices(db, { view: "outstanding", page })).rejects.toThrow(/Invalid page/);
    }
  });

  it("rejects pages whose offset would leave the safe integer range", async () => {
    await expect(listInvoices(db, { view: "outstanding", page: 1e15 })).rejects.toThrow(
      /outside the safe integer range/,
    );
  });

  it("accepts large but valid pages and returns an empty page", async () => {
    await addInvoice({});
    const far = await listInvoices(db, { view: "outstanding", page: 1_000_000 });
    expect(far.rows).toHaveLength(0);
    expect(far).toMatchObject({ total: 1, page: 1_000_000, pageCount: 1 });
  });
});

describe("invoiceSummary", () => {
  it("combines both open categories and keeps whole-paise precision past int4", async () => {
    await addInvoice({ dueDate: addDays(today, -2), totalPaise: 1_500_000_000 });
    await addInvoice({ dueDate: addDays(today, 2), totalPaise: 1_500_000_000 });
    await addInvoice({ status: "paid", paidPaise: 100000 });

    expect(await invoiceSummary(db)).toEqual({
      receivablesCount: 2,
      receivablesPaise: 3_000_000_000,
      overdueCount: 1,
      overduePaise: 1_500_000_000,
      paidCount: 1,
    });
  });

  it("reports zeros for an empty ledger", async () => {
    expect(await invoiceSummary(db)).toEqual({
      receivablesCount: 0,
      receivablesPaise: 0,
      overdueCount: 0,
      overduePaise: 0,
      paidCount: 0,
    });
  });

  it("treats a due-today invoice as outstanding, not overdue", async () => {
    await addInvoice({ dueDate: today });
    const summary = await invoiceSummary(db);
    expect(summary).toMatchObject({ receivablesCount: 1, overdueCount: 0, overduePaise: 0 });
  });
});

describe("listPayments", () => {
  it("orders the ledger by payment date first, then by entry recency", async () => {
    const invoice = await addInvoice({});
    const backdated = await addPayment(invoice.id, { paidOn: addDays(today, -5), createdAt: new Date() });
    const olderEntry = await addPayment(invoice.id, { paidOn: today, createdAt: new Date(Date.now() - 60_000) });
    const newestEntry = await addPayment(invoice.id, { paidOn: today, createdAt: new Date() });

    const rows = (await listPayments(db, {})).rows;
    expect(rows.map((r) => r.paymentId)).toEqual([newestEntry.id, olderEntry.id, backdated.id]);
  });

  it("paginates and searches by invoice number", async () => {
    const first = await addInvoice({ number: "INV-LED-1" });
    const second = await addInvoice({ number: "INV-LED-2" });
    await addPayment(first.id, { paidOn: today });
    await addPayment(second.id, { paidOn: addDays(today, -1) });

    const page = await listPayments(db, {});
    expect(page.total).toBe(2);
    expect(page.rows.map((r) => r.invoiceNumber)).toEqual(["INV-LED-1", "INV-LED-2"]);

    const byNumber = await listPayments(db, { q: "LED-2" });
    expect(byNumber.rows.map((r) => r.invoiceNumber)).toEqual(["INV-LED-2"]);
  });

  it("rejects invalid page inputs instead of producing an unsafe offset", async () => {
    for (const page of [Number.NaN, Number.POSITIVE_INFINITY, -3, 0, 1.25, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(listPayments(db, { page })).rejects.toThrow(/Invalid page/);
    }
  });

  it("rejects pages whose offset would leave the safe integer range", async () => {
    await expect(listPayments(db, { page: 1e15 })).rejects.toThrow(/outside the safe integer range/);
  });

  it("accepts large but valid pages and returns an empty page", async () => {
    const invoice = await addInvoice({});
    await addPayment(invoice.id, {});
    const far = await listPayments(db, { page: 1_000_000 });
    expect(far.rows).toHaveLength(0);
    expect(far).toMatchObject({ total: 1, page: 1_000_000, pageCount: 1 });
  });
});

describe("resolveInvoiceRef", () => {
  it("resolves by id and by exact number", async () => {
    const invoice = await addInvoice({ number: "INV-REF-1" });
    expect(await resolveInvoiceRef(db, { invoiceId: invoice.id })).toEqual({ id: invoice.id });
    expect(await resolveInvoiceRef(db, { invoiceNumber: "INV-REF-1" })).toEqual({ id: invoice.id });
  });

  it("reports unknown references", async () => {
    await addInvoice({ number: "INV-REF-2" });
    expect(await resolveInvoiceRef(db, { invoiceNumber: "INV-MISSING" })).toBeNull();
    expect(await resolveInvoiceRef(db, { invoiceId: "00000000-0000-0000-0000-000000000000" })).toBeNull();
    expect(await resolveInvoiceRef(db, {})).toBeNull();
  });
});
