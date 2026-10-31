import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { appToday } from "./clock";
import { addDays } from "./dates";
import {
  getFinanceDrillDown,
  getFinanceSummary,
  parseFinanceFilters,
  parseFinanceMetric,
  type FinanceFilters,
} from "./finance-queries";

const { customers, invoices, payments, plans, products, subscriptionLines, subscriptions } = schema;
type TestDb = ReturnType<typeof drizzle<typeof schema>>;

describe("finance-queries parameter parsing", () => {
  it("parses valid metric and falls back on invalid values", () => {
    expect(parseFinanceMetric("revenue")).toBe("revenue");
    expect(parseFinanceMetric("owed")).toBe("owed");
    expect(parseFinanceMetric("payments")).toBe("payments");
    expect(parseFinanceMetric("overdue")).toBe("overdue");
    expect(parseFinanceMetric("active_subscriptions")).toBe("active_subscriptions");
    expect(parseFinanceMetric("unknown")).toBe("revenue");
    expect(parseFinanceMetric(undefined)).toBe("revenue");
  });

  it("parses filters cleanly and validates dates and page", () => {
    const filters = parseFinanceFilters({
      metric: "owed",
      from: "2026-01-01",
      to: "2026-06-30",
      q: " Acme ",
      paymentMethod: "upi",
      page: "2",
    });
    expect(filters).toEqual({
      metric: "owed",
      from: "2026-01-01",
      to: "2026-06-30",
      q: "Acme",
      paymentMethod: "upi",
      invoiceStatus: "all",
      subscriptionStatus: "all",
      page: 2,
    });
  });

  it("handles inverted dates by swapping them", () => {
    const filters = parseFinanceFilters({
      from: "2026-12-31",
      to: "2026-01-01",
    });
    expect(filters.from).toBe("2026-01-01");
    expect(filters.to).toBe("2026-12-31");
  });

  it("falls back to page 1 on invalid page", () => {
    expect(parseFinanceFilters({ page: "-5" }).page).toBe(1);
    expect(parseFinanceFilters({ page: "abc" }).page).toBe(1);
    expect(parseFinanceFilters({ page: "1e20" }).page).toBe(1);
  });
});

describe("finance-queries financial summary & reconciliation", () => {
  let db: TestDb;
  let customer1Id: string;
  let customer2Id: string;
  let sub1Id: string;
  let sub2Id: string;
  let today: string;
  let serial = 0;

  beforeEach(async () => {
    db = drizzle({ client: new PGlite(), schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    today = await appToday(db);

    const [product] = await db
      .insert(products)
      .values({
        name: "License",
        type: "service",
        salesPricePaise: 50000,
      })
      .returning();

    const [c1, c2] = await db
      .insert(customers)
      .values([
        { name: "Acme Corp", email: "acme@example.test" },
        { name: "Beta Ltd", email: "beta@example.test" },
      ])
      .returning();
    customer1Id = c1.id;
    customer2Id = c2.id;

    const [pMonthly, pYearly] = await db
      .insert(plans)
      .values([
        { name: "Pro Monthly", pricePaise: 100000, frequency: "monthly" },
        { name: "Pro Yearly", pricePaise: 1200000, frequency: "yearly" },
      ])
      .returning();

    // Active sub 1: starts today, no expiry
    const [s1] = await db
      .insert(subscriptions)
      .values({
        number: "SUB-0001",
        customerId: customer1Id,
        planId: pMonthly.id,
        status: "active",
        startDate: today,
      })
      .returning();
    await db.insert(subscriptionLines).values({
      subscriptionId: s1.id,
      productId: product.id,
      description: "Pro Monthly License",
      quantity: 2,
      unitPricePaise: 50000, // 2 * 50,000 = 1,00,000 paise/month
    });
    sub1Id = s1.id;

    // Active sub 2: starts today, expires in 30 days
    const [s2] = await db
      .insert(subscriptions)
      .values({
        number: "SUB-0002",
        customerId: customer2Id,
        planId: pYearly.id,
        status: "active",
        startDate: today,
        expiryDate: addDays(today, 30),
      })
      .returning();
    await db.insert(subscriptionLines).values({
      subscriptionId: s2.id,
      productId: product.id,
      description: "Pro Yearly License",
      quantity: 1,
      unitPricePaise: 1200000, // 12,00,000 paise/year = 1,00,000 paise/month MRR
    });
    sub2Id = s2.id;

    // Inactive / paused sub: should NOT count in active subscriptions
    const [sPaused] = await db
      .insert(subscriptions)
      .values({
        number: "SUB-PAUSED",
        customerId: customer1Id,
        planId: pMonthly.id,
        status: "paused",
        startDate: today,
      })
      .returning();
    await db.insert(subscriptionLines).values({
      subscriptionId: sPaused.id,
      productId: product.id,
      description: "Paused line",
      quantity: 1,
      unitPricePaise: 50000,
    });

    // Expired sub: should NOT count in active subscriptions
    const [sExpired] = await db
      .insert(subscriptions)
      .values({
        number: "SUB-EXPIRED",
        customerId: customer2Id,
        planId: pMonthly.id,
        status: "active",
        startDate: "2025-01-01",
        expiryDate: addDays(today, -5),
      })
      .returning();
    await db.insert(subscriptionLines).values({
      subscriptionId: sExpired.id,
      productId: product.id,
      description: "Expired line",
      quantity: 1,
      unitPricePaise: 50000,
    });
  });

  async function createInvoice(options: {
    customerId?: string;
    subscriptionId?: string;
    totalPaise?: number;
    paidPaise?: number;
    dueDate?: string;
    issueDate?: string;
    status?: "draft" | "confirmed" | "paid" | "cancelled";
    number?: string;
  }) {
    serial += 1;
    const status = options.status ?? "confirmed";
    const totalPaise = options.totalPaise ?? 200000;
    const paidPaise = options.paidPaise ?? 0;
    const num = options.number ?? `INV-${String(serial).padStart(4, "0")}`;

    const [inv] = await db
      .insert(invoices)
      .values({
        number: num,
        subscriptionId: options.subscriptionId ?? sub1Id,
        customerId: options.customerId ?? customer1Id,
        periodStart: addDays("2026-01-01", serial),
        periodEnd: addDays("2026-02-01", serial),
        issueDate: options.issueDate ?? today,
        dueDate: options.dueDate ?? addDays(today, 10),
        subtotalPaise: totalPaise,
        totalPaise,
        paidPaise,
        status,
        breakdown: {},
      })
      .returning();
    return inv;
  }

  async function createPayment(options: {
    invoiceId: string;
    amountPaise: number;
    method?: "bank_transfer" | "upi" | "card" | "cash" | "cheque";
    paidOn?: string;
    note?: string;
  }) {
    const [pmt] = await db
      .insert(payments)
      .values({
        invoiceId: options.invoiceId,
        amountPaise: options.amountPaise,
        method: options.method ?? "upi",
        paidOn: options.paidOn ?? today,
        note: options.note ?? "Test payment",
      })
      .returning();
    return pmt;
  }
    it("correctly calculates active subscriptions and MRR/ARR", async () => {
      const defaultFilters = parseFinanceFilters({});
      const summary = await getFinanceSummary(db, defaultFilters);

      // Sub 1: 1,00,000 / mo. Sub 2: 12,00,000 / yr = 1,00,000 / mo.
      // Total active = 2. Paused and expired are excluded.
      expect(summary.activeSubscriptionsCount).toBe(2);
      expect(summary.activeSubscriptionsArrPaise).toBe(1200000 + 1200000); // 24,00,000
      expect(summary.activeSubscriptionsMrrPaise).toBe(200000); // 2,00,000
    });

    it("calculates revenue, payments, amount owed, and overdue invoices with exact reconciliation", async () => {
      // 1. Outstanding invoice: due in 10 days, total 3,00,000, paid 1,00,000 -> balance 2,00,000
      const invOutstanding = await createInvoice({
        customerId: customer1Id,
        totalPaise: 300000,
        paidPaise: 100000,
        dueDate: addDays(today, 10),
      });
      await createPayment({ invoiceId: invOutstanding.id, amountPaise: 100000, method: "upi" });

      // 2. Overdue invoice: due 5 days ago, total 1,50,000, paid 0 -> balance 1,50,000
      const invOverdue = await createInvoice({
        customerId: customer2Id,
        totalPaise: 150000,
        paidPaise: 0,
        dueDate: addDays(today, -5),
      });

      // 3. Fully paid invoice: total 50,000, paid 50,000 -> status paid
      const invPaid = await createInvoice({
        customerId: customer1Id,
        totalPaise: 50000,
        paidPaise: 50000,
        status: "paid",
        dueDate: addDays(today, -10),
      });
      await createPayment({ invoiceId: invPaid.id, amountPaise: 50000, method: "bank_transfer" });

      const filters: FinanceFilters = {
        metric: "revenue",
        page: 1,
      };

      const summary = await getFinanceSummary(db, filters);

      // Revenue: 1,00,000 (upi) + 50,000 (bank_transfer) = 1,50,000
      expect(summary.revenuePaise).toBe(150000);
      expect(summary.revenuePaymentCount).toBe(2);

      // Payments ledger: 2 payments, 1,50,000 total
      expect(summary.paymentsCount).toBe(2);
      expect(summary.paymentsTotalPaise).toBe(150000);

      // Amount owed (outstanding, dueDate >= today): 1 invoice, balance 2,00,000
      expect(summary.amountOwedCount).toBe(1);
      expect(summary.amountOwedPaise).toBe(200000);

      // Overdue invoices (dueDate < today): 1 invoice, balance 1,50,000
      expect(summary.overdueCount).toBe(1);
      expect(summary.overduePaise).toBe(150000);

      // --- VERIFY DRILL-DOWN RECONCILIATION ---

      // Drill-down: Revenue
      const revDrill = await getFinanceDrillDown(db, { ...filters, metric: "revenue" });
      expect(revDrill.metric).toBe("revenue");
      if (revDrill.metric === "revenue") {
        expect(revDrill.page.total).toBe(summary.revenuePaymentCount);
        const sumOfAmounts = revDrill.page.rows.reduce((sum, r) => sum + r.amountPaise, 0);
        expect(sumOfAmounts).toBe(summary.revenuePaise);
      }

      // Drill-down: Payments
      const pmtDrill = await getFinanceDrillDown(db, { ...filters, metric: "payments" });
      expect(pmtDrill.metric).toBe("payments");
      if (pmtDrill.metric === "payments") {
        expect(pmtDrill.page.total).toBe(summary.paymentsCount);
        const sumOfAmounts = pmtDrill.page.rows.reduce((sum, r) => sum + r.amountPaise, 0);
        expect(sumOfAmounts).toBe(summary.paymentsTotalPaise);
      }

      // Drill-down: Amount Owed
      const owedDrill = await getFinanceDrillDown(db, { ...filters, metric: "owed" });
      expect(owedDrill.metric).toBe("owed");
      if (owedDrill.metric === "owed") {
        expect(owedDrill.page.total).toBe(summary.amountOwedCount);
        const sumOfBalances = owedDrill.page.rows.reduce((sum, r) => sum + r.balancePaise, 0);
        expect(sumOfBalances).toBe(summary.amountOwedPaise);
        expect(owedDrill.page.rows[0].invoiceId).toBe(invOutstanding.id);
      }

      // Drill-down: Overdue
      const overdueDrill = await getFinanceDrillDown(db, { ...filters, metric: "overdue" });
      expect(overdueDrill.metric).toBe("overdue");
      if (overdueDrill.metric === "overdue") {
        expect(overdueDrill.page.total).toBe(summary.overdueCount);
        const sumOfBalances = overdueDrill.page.rows.reduce((sum, r) => sum + r.balancePaise, 0);
        expect(sumOfBalances).toBe(summary.overduePaise);
        expect(overdueDrill.page.rows[0].invoiceId).toBe(invOverdue.id);
        expect(overdueDrill.page.rows[0].daysOverdue).toBe(5);
      }

      // Drill-down: Active subscriptions
      const subDrill = await getFinanceDrillDown(db, { ...filters, metric: "active_subscriptions" });
      expect(subDrill.metric).toBe("active_subscriptions");
      if (subDrill.metric === "active_subscriptions") {
        expect(subDrill.page.total).toBe(summary.activeSubscriptionsCount);
        expect(subDrill.page.rows.length).toBe(2);
      }
    });

    it("respects search filter (q) across aggregates and drill-down", async () => {
      const inv1 = await createInvoice({ customerId: customer1Id, totalPaise: 100000 });
      await createPayment({ invoiceId: inv1.id, amountPaise: 100000 });

      const inv2 = await createInvoice({ customerId: customer2Id, totalPaise: 200000 });
      await createPayment({ invoiceId: inv2.id, amountPaise: 200000 });

      // Filter by "Beta" (customer2)
      const filters: FinanceFilters = {
        metric: "revenue",
        q: "Beta",
        page: 1,
      };

      const summary = await getFinanceSummary(db, filters);
      expect(summary.revenuePaise).toBe(200000);
      expect(summary.revenuePaymentCount).toBe(1);

      const drill = await getFinanceDrillDown(db, filters);
      if (drill.metric === "revenue") {
        expect(drill.page.total).toBe(1);
        expect(drill.page.rows[0].customerName).toBe("Beta Ltd");
        expect(drill.page.rows[0].amountPaise).toBe(200000);
      }
    });

    it("respects payment method filter", async () => {
      const inv = await createInvoice({ customerId: customer1Id, totalPaise: 300000 });
      await createPayment({ invoiceId: inv.id, amountPaise: 100000, method: "upi" });
      await createPayment({ invoiceId: inv.id, amountPaise: 200000, method: "bank_transfer" });

      const filters: FinanceFilters = {
        metric: "revenue",
        paymentMethod: "upi",
        page: 1,
      };

      const summary = await getFinanceSummary(db, filters);
      expect(summary.revenuePaise).toBe(100000);
      expect(summary.revenuePaymentCount).toBe(1);

      const drill = await getFinanceDrillDown(db, filters);
      if (drill.metric === "revenue") {
        expect(drill.page.total).toBe(1);
        expect(drill.page.rows[0].method).toBe("upi");
      }
    });

    it("respects date range filter for payments and invoices", async () => {
      const invOld = await createInvoice({
        issueDate: "2026-01-01",
        dueDate: "2026-01-15",
        totalPaise: 100000,
      });
      await createPayment({
        invoiceId: invOld.id,
        amountPaise: 100000,
        paidOn: "2026-01-05",
      });

      const invNew = await createInvoice({
        issueDate: "2026-02-01",
        dueDate: "2026-02-15",
        totalPaise: 200000,
      });
      await createPayment({
        invoiceId: invNew.id,
        amountPaise: 200000,
        paidOn: "2026-02-05",
      });

      const filters: FinanceFilters = {
        metric: "revenue",
        from: "2026-02-01",
        to: "2026-02-28",
        page: 1,
      };

      const summary = await getFinanceSummary(db, filters);
      expect(summary.revenuePaise).toBe(200000);
      expect(summary.revenuePaymentCount).toBe(1);
    });

    it("treats due-today open invoice as Amount Owed (outstanding), not overdue", async () => {
      await createInvoice({
        customerId: customer1Id,
        totalPaise: 120000,
        paidPaise: 0,
        dueDate: today, // due today
      });

      const summary = await getFinanceSummary(db, { metric: "owed", page: 1 });
      expect(summary.amountOwedCount).toBe(1);
      expect(summary.amountOwedPaise).toBe(120000);
      expect(summary.overdueCount).toBe(0);
      expect(summary.overduePaise).toBe(0);
    });
  });
