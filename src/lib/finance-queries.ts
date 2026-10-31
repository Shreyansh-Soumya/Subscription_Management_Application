import { and, asc, count, desc, eq, gt, gte, ilike, isNull, lte, lt, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import {
  billingFrequencyEnum,
  customers,
  invoices,
  invoiceStatusEnum,
  paymentMethodEnum,
  payments,
  plans,
  subscriptionLines,
  subscriptions,
  subscriptionStatusEnum,
} from "@/db/schema";
import { appToday } from "./clock";
import { daysBetween, isRealDate, type BillingFrequency } from "./dates";
import type { InvoiceStatus, SubscriptionStatus } from "./status";

export const PAGE_SIZE = 25;
const MAX_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE);

const PERIODS_PER_YEAR: Record<BillingFrequency, number> = {
  daily: 365,
  weekly: 52,
  monthly: 12,
  yearly: 1,
};

export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];

export type FinanceMetric = "active_subscriptions" | "revenue" | "owed" | "payments" | "overdue";

export const FINANCE_METRICS: FinanceMetric[] = [
  "active_subscriptions",
  "revenue",
  "owed",
  "payments",
  "overdue",
];

export type FinanceFilters = {
  metric: FinanceMetric;
  from?: string;
  to?: string;
  q?: string;
  paymentMethod?: PaymentMethod | "all";
  invoiceStatus?: InvoiceStatus | "all";
  subscriptionStatus?: SubscriptionStatus | "all";
  page: number;
};

export type Page<T> = {
  rows: T[];
  total: number;
  page: number;
  pageCount: number;
};

export type FinanceSummary = {
  // Metric 1: Active Subscriptions
  activeSubscriptionsCount: number;
  activeSubscriptionsMrrPaise: number;
  activeSubscriptionsArrPaise: number;

  // Metric 2: Revenue
  revenuePaise: number;
  revenuePaymentCount: number;

  // Metric 3: Amount Owed (Outstanding: confirmed, open balance, dueDate >= today)
  amountOwedPaise: number;
  amountOwedCount: number;

  // Metric 4: Payments (All ledger activity matching filters)
  paymentsCount: number;
  paymentsTotalPaise: number;

  // Metric 5: Overdue Invoices (confirmed, open balance, dueDate < today)
  overduePaise: number;
  overdueCount: number;

  // Supplementary context
  totalInvoicedPaise: number;
  totalInvoicedCount: number;
};

export type FinanceSubscriptionItem = {
  subscriptionId: string;
  number: string;
  customerName: string;
  customerEmail: string;
  planName: string;
  frequency: BillingFrequency;
  recurringPaise: number;
  startDate: string;
  nextBillingDate: string | null;
  expiryDate: string | null;
  status: SubscriptionStatus;
};

export type FinanceRevenueItem = {
  invoiceId: string;
  paymentId: string;
  paidOn: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  method: PaymentMethod;
  amountPaise: number;
  note: string | null;
};

export type FinanceOwedItem = {
  invoiceId: string;
  number: string;
  customerName: string;
  customerEmail: string;
  issueDate: string;
  dueDate: string;
  totalPaise: number;
  paidPaise: number;
  balancePaise: number;
  status: InvoiceStatus;
};

export type FinancePaymentItem = {
  invoiceId: string;
  paymentId: string;
  paidOn: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  method: PaymentMethod;
  amountPaise: number;
  note: string | null;
  recordedBy: string | null;
};

export type FinanceOverdueItem = {
  invoiceId: string;
  number: string;
  customerName: string;
  customerEmail: string;
  issueDate: string;
  dueDate: string;
  daysOverdue: number;
  totalPaise: number;
  paidPaise: number;
  balancePaise: number;
  status: InvoiceStatus;
};

export type DrillDownData =
  | { metric: "active_subscriptions"; page: Page<FinanceSubscriptionItem> }
  | { metric: "revenue"; page: Page<FinanceRevenueItem> }
  | { metric: "owed"; page: Page<FinanceOwedItem> }
  | { metric: "payments"; page: Page<FinancePaymentItem> }
  | { metric: "overdue"; page: Page<FinanceOverdueItem> };

function toSafePaise(value: string | number | null): number {
  if (value === null) return 0;
  const amount = BigInt(value);
  if (amount < BigInt(0) || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Monetary aggregate outside the safe paise range.");
  }
  return Number(amount);
}

function resolvePage(value: number | undefined): number {
  const page = value ?? 1;
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new Error(`Invalid page ${String(value)}: expected a positive safe integer.`);
  }
  if (page > MAX_PAGE) {
    throw new Error(`Page ${String(value)} pushes the pagination offset outside the safe integer range.`);
  }
  return page;
}

export function parseFinanceMetric(raw: string | undefined): FinanceMetric {
  if (raw && (FINANCE_METRICS as readonly string[]).includes(raw)) {
    return raw as FinanceMetric;
  }
  return "revenue";
}

export function parseFinanceFilters(raw: Record<string, string | string[] | undefined>): FinanceFilters {
  const first = (val: string | string[] | undefined) => (Array.isArray(val) ? val[0] : val);

  const rawMetric = first(raw.metric);
  const metric = parseFinanceMetric(rawMetric);

  let from = first(raw.from)?.trim();
  if (from && !isRealDate(from)) from = undefined;

  let to = first(raw.to)?.trim();
  if (to && !isRealDate(to)) to = undefined;

  if (from && to && from > to) {
    const temp = from;
    from = to;
    to = temp;
  }

  const rawQ = first(raw.q)?.trim().slice(0, 100);
  const q = rawQ || undefined;

  const rawMethod = first(raw.paymentMethod);
  const paymentMethod =
    rawMethod && (paymentMethodEnum.enumValues as readonly string[]).includes(rawMethod)
      ? (rawMethod as PaymentMethod)
      : "all";

  const rawInvStatus = first(raw.invoiceStatus);
  const invoiceStatus =
    rawInvStatus && (invoiceStatusEnum.enumValues as readonly string[]).includes(rawInvStatus)
      ? (rawInvStatus as InvoiceStatus)
      : "all";

  const rawSubStatus = first(raw.subscriptionStatus);
  const subscriptionStatus =
    rawSubStatus && (subscriptionStatusEnum.enumValues as readonly string[]).includes(rawSubStatus)
      ? (rawSubStatus as SubscriptionStatus)
      : "all";

  const rawPage = first(raw.page);
  let page = 1;
  if (rawPage && /^\d+$/.test(rawPage.trim())) {
    const parsed = Number(rawPage);
    if (Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_PAGE) {
      page = parsed;
    }
  }

  return {
    metric,
    from,
    to,
    q,
    paymentMethod,
    invoiceStatus,
    subscriptionStatus,
    page,
  };
}

const openBalanceCondition = sql`${invoices.paidPaise} < ${invoices.totalPaise}`;

function buildPaymentFilters(filters: FinanceFilters) {
  const conditions: SQL[] = [];

  if (filters.from) {
    conditions.push(gte(payments.paidOn, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(payments.paidOn, filters.to));
  }
  if (filters.paymentMethod && filters.paymentMethod !== "all") {
    conditions.push(eq(payments.method, filters.paymentMethod));
  }
  if (filters.q) {
    const like = `%${filters.q}%`;
    conditions.push(
      or(
        ilike(invoices.number, like),
        ilike(customers.name, like),
        ilike(customers.email, like),
        ilike(payments.note, like),
      )!,
    );
  }

  return conditions.length ? and(...conditions) : undefined;
}

function buildInvoiceFilters(
  today: string,
  category: "all" | "outstanding" | "overdue",
  filters: FinanceFilters,
) {
  const conditions: SQL[] = [];

  if (category === "outstanding") {
    conditions.push(eq(invoices.status, "confirmed"), openBalanceCondition, gte(invoices.dueDate, today));
  } else if (category === "overdue") {
    conditions.push(eq(invoices.status, "confirmed"), openBalanceCondition, lt(invoices.dueDate, today));
  } else {
    // "all"
    if (filters.invoiceStatus && filters.invoiceStatus !== "all") {
      conditions.push(eq(invoices.status, filters.invoiceStatus));
    }
  }

  if (filters.from) {
    conditions.push(gte(invoices.issueDate, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(invoices.issueDate, filters.to));
  }
  if (filters.q) {
    const like = `%${filters.q}%`;
    conditions.push(
      or(
        ilike(invoices.number, like),
        ilike(customers.name, like),
        ilike(customers.email, like),
      )!,
    );
  }

  return conditions.length ? and(...conditions) : undefined;
}

function buildSubscriptionFilters(today: string, filters: FinanceFilters) {
  const conditions: SQL[] = [];

  // Active definition per revenue.ts: running today, active status and not expired
  if (filters.subscriptionStatus && filters.subscriptionStatus !== "all") {
    conditions.push(eq(subscriptions.status, filters.subscriptionStatus));
  } else {
    conditions.push(
      eq(subscriptions.status, "active"),
      or(isNull(subscriptions.expiryDate), gt(subscriptions.expiryDate, today))!,
    );
  }

  if (filters.from) {
    conditions.push(gte(subscriptions.startDate, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(subscriptions.startDate, filters.to));
  }
  if (filters.q) {
    const like = `%${filters.q}%`;
    conditions.push(
      or(
        ilike(subscriptions.number, like),
        ilike(customers.name, like),
        ilike(customers.email, like),
        ilike(plans.name, like),
      )!,
    );
  }

  return conditions.length ? and(...conditions) : undefined;
}

/**
 * Calculates financial aggregates directly in the database.
 * Every aggregate respects the provided filters and reconciles exactly with its drill-down records.
 */
export async function getFinanceSummary(db: Db, filters: FinanceFilters): Promise<FinanceSummary> {
  const today = await appToday(db);

  // 1. Payment aggregates (for Revenue and Payments)
  const paymentWhere = buildPaymentFilters(filters);
  const [paymentAgg] = await db
    .select({
      count: count(),
      totalPaise: sql<string>`coalesce(sum(${payments.amountPaise}), 0)`,
    })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(paymentWhere);

  // 2. Outstanding Invoices (Amount Owed: confirmed, unpaid balance, dueDate >= today)
  const owedWhere = buildInvoiceFilters(today, "outstanding", filters);
  const [owedAgg] = await db
    .select({
      count: count(),
      totalBalancePaise: sql<string>`coalesce(sum(${invoices.totalPaise} - ${invoices.paidPaise}), 0)`,
    })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(owedWhere);

  // 3. Overdue Invoices (confirmed, unpaid balance, dueDate < today)
  const overdueWhere = buildInvoiceFilters(today, "overdue", filters);
  const [overdueAgg] = await db
    .select({
      count: count(),
      totalBalancePaise: sql<string>`coalesce(sum(${invoices.totalPaise} - ${invoices.paidPaise}), 0)`,
    })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(overdueWhere);

  // 4. Active Subscriptions & MRR/ARR
  const subWhere = buildSubscriptionFilters(today, filters);
  const [subCountRes, subLineTotals] = await Promise.all([
    db
      .select({ activeCount: count() })
      .from(subscriptions)
      .innerJoin(customers, eq(subscriptions.customerId, customers.id))
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(subWhere),
    db
      .select({
        frequency: plans.frequency,
        amountPaise: sql<number>`coalesce(sum(${subscriptionLines.quantity}::bigint * ${subscriptionLines.unitPricePaise}), 0)`.mapWith(Number),
      })
      .from(subscriptions)
      .innerJoin(customers, eq(subscriptions.customerId, customers.id))
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .innerJoin(subscriptionLines, eq(subscriptionLines.subscriptionId, subscriptions.id))
      .where(subWhere)
      .groupBy(plans.frequency),
  ]);

  const arrPaise = subLineTotals.reduce(
    (sum, row) => sum + row.amountPaise * PERIODS_PER_YEAR[row.frequency],
    0,
  );
  const mrrPaise = Math.round(arrPaise / 12);

  // 5. Total Invoiced context
  const invoicedWhere = buildInvoiceFilters(today, "all", filters);
  const [invoicedAgg] = await db
    .select({
      count: count(),
      totalPaise: sql<string>`coalesce(sum(${invoices.totalPaise}), 0)`,
    })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(invoicedWhere);

  return {
    activeSubscriptionsCount: subCountRes[0]?.activeCount ?? 0,
    activeSubscriptionsMrrPaise: mrrPaise,
    activeSubscriptionsArrPaise: arrPaise,

    revenuePaise: toSafePaise(paymentAgg?.totalPaise ?? "0"),
    revenuePaymentCount: paymentAgg?.count ?? 0,

    amountOwedPaise: toSafePaise(owedAgg?.totalBalancePaise ?? "0"),
    amountOwedCount: owedAgg?.count ?? 0,

    paymentsCount: paymentAgg?.count ?? 0,
    paymentsTotalPaise: toSafePaise(paymentAgg?.totalPaise ?? "0"),

    overduePaise: toSafePaise(overdueAgg?.totalBalancePaise ?? "0"),
    overdueCount: overdueAgg?.count ?? 0,

    totalInvoicedPaise: toSafePaise(invoicedAgg?.totalPaise ?? "0"),
    totalInvoicedCount: invoicedAgg?.count ?? 0,
  };
}

/**
 * Retrieves the underlying records contributing to the selected financial metric.
 * Uses exact pagination and matches the filter parameters.
 */
export async function getFinanceDrillDown(
  db: Db,
  filters: FinanceFilters,
): Promise<DrillDownData> {
  const today = await appToday(db);
  const page = resolvePage(filters.page);
  const offset = (page - 1) * PAGE_SIZE;

  switch (filters.metric) {
    case "active_subscriptions": {
      const where = buildSubscriptionFilters(today, filters);
      const [totals] = await db
        .select({ total: count() })
        .from(subscriptions)
        .innerJoin(customers, eq(subscriptions.customerId, customers.id))
        .innerJoin(plans, eq(subscriptions.planId, plans.id))
        .where(where);

      // Subquery or join for recurring line amounts per subscription
      const rows = await db
        .select({
          subscriptionId: subscriptions.id,
          number: subscriptions.number,
          customerName: customers.name,
          customerEmail: customers.email,
          planName: plans.name,
          frequency: plans.frequency,
          startDate: subscriptions.startDate,
          nextBillingDate: subscriptions.nextBillingDate,
          expiryDate: subscriptions.expiryDate,
          status: subscriptions.status,
          recurringPaise: sql<number>`coalesce(
            (select sum(${subscriptionLines.quantity}::bigint * ${subscriptionLines.unitPricePaise})
             from ${subscriptionLines}
             where ${subscriptionLines.subscriptionId} = ${subscriptions.id}), 0
          )`.mapWith(Number),
        })
        .from(subscriptions)
        .innerJoin(customers, eq(subscriptions.customerId, customers.id))
        .innerJoin(plans, eq(subscriptions.planId, plans.id))
        .where(where)
        .orderBy(desc(subscriptions.createdAt), asc(subscriptions.id))
        .limit(PAGE_SIZE)
        .offset(offset);

      const total = totals?.total ?? 0;
      return {
        metric: "active_subscriptions",
        page: {
          rows,
          total,
          page,
          pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        },
      };
    }

    case "revenue": {
      const where = buildPaymentFilters(filters);
      const [totals] = await db
        .select({ total: count() })
        .from(payments)
        .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
        .innerJoin(customers, eq(invoices.customerId, customers.id))
        .where(where);

      const rows = await db
        .select({
          paymentId: payments.id,
          paidOn: payments.paidOn,
          invoiceId: invoices.id,
          invoiceNumber: invoices.number,
          customerName: customers.name,
          customerEmail: customers.email,
          method: payments.method,
          amountPaise: payments.amountPaise,
          note: payments.note,
        })
        .from(payments)
        .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
        .innerJoin(customers, eq(invoices.customerId, customers.id))
        .where(where)
        .orderBy(desc(payments.paidOn), desc(payments.createdAt), desc(payments.id))
        .limit(PAGE_SIZE)
        .offset(offset);

      const total = totals?.total ?? 0;
      return {
        metric: "revenue",
        page: {
          rows,
          total,
          page,
          pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        },
      };
    }

    case "owed": {
      const where = buildInvoiceFilters(today, "outstanding", filters);
      const [totals] = await db
        .select({ total: count() })
        .from(invoices)
        .innerJoin(customers, eq(invoices.customerId, customers.id))
        .where(where);

      const rows = await db
        .select({
          invoiceId: invoices.id,
          number: invoices.number,
          customerName: customers.name,
          customerEmail: customers.email,
          issueDate: invoices.issueDate,
          dueDate: invoices.dueDate,
          totalPaise: invoices.totalPaise,
          paidPaise: invoices.paidPaise,
          balancePaise: sql<number>`${invoices.totalPaise} - ${invoices.paidPaise}`,
          status: invoices.status,
        })
        .from(invoices)
        .innerJoin(customers, eq(invoices.customerId, customers.id))
        .where(where)
        .orderBy(asc(invoices.dueDate), asc(invoices.id))
        .limit(PAGE_SIZE)
        .offset(offset);

      const total = totals?.total ?? 0;
      return {
        metric: "owed",
        page: {
          rows,
          total,
          page,
          pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        },
      };
    }

    case "payments": {
      const where = buildPaymentFilters(filters);
      const [totals] = await db
        .select({ total: count() })
        .from(payments)
        .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
        .innerJoin(customers, eq(invoices.customerId, customers.id))
        .where(where);

      const rows = await db
        .select({
          paymentId: payments.id,
          paidOn: payments.paidOn,
          invoiceId: invoices.id,
          invoiceNumber: invoices.number,
          customerName: customers.name,
          customerEmail: customers.email,
          method: payments.method,
          amountPaise: payments.amountPaise,
          note: payments.note,
          recordedBy: payments.recordedBy,
        })
        .from(payments)
        .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
        .innerJoin(customers, eq(invoices.customerId, customers.id))
        .where(where)
        .orderBy(desc(payments.paidOn), desc(payments.createdAt), desc(payments.id))
        .limit(PAGE_SIZE)
        .offset(offset);

      const total = totals?.total ?? 0;
      return {
        metric: "payments",
        page: {
          rows,
          total,
          page,
          pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        },
      };
    }

    case "overdue": {
      const where = buildInvoiceFilters(today, "overdue", filters);
      const [totals] = await db
        .select({ total: count() })
        .from(invoices)
        .innerJoin(customers, eq(invoices.customerId, customers.id))
        .where(where);

      const rawRows = await db
        .select({
          invoiceId: invoices.id,
          number: invoices.number,
          customerName: customers.name,
          customerEmail: customers.email,
          issueDate: invoices.issueDate,
          dueDate: invoices.dueDate,
          totalPaise: invoices.totalPaise,
          paidPaise: invoices.paidPaise,
          balancePaise: sql<number>`${invoices.totalPaise} - ${invoices.paidPaise}`,
          status: invoices.status,
        })
        .from(invoices)
        .innerJoin(customers, eq(invoices.customerId, customers.id))
        .where(where)
        .orderBy(asc(invoices.dueDate), asc(invoices.id))
        .limit(PAGE_SIZE)
        .offset(offset);

      const rows: FinanceOverdueItem[] = rawRows.map((row) => ({
        ...row,
        daysOverdue: daysBetween(row.dueDate, today),
      }));

      const total = totals?.total ?? 0;
      return {
        metric: "overdue",
        page: {
          rows,
          total,
          page,
          pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        },
      };
    }
  }
}
