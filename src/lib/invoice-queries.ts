import { and, asc, count, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { customers, invoices, payments, paymentMethodEnum } from "@/db/schema";
import { appToday } from "./clock";
import type { InvoiceStatus } from "./status";

const PAGE_SIZE = 25;

/** Largest page whose OFFSET ((page-1) * PAGE_SIZE) is still a safe integer. */
const MAX_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE);

export type InvoiceView = "paid" | "outstanding" | "overdue";

export type Page<T> = { rows: T[]; total: number; page: number; pageCount: number };

export type InvoiceListItem = {
  invoiceId: string;
  number: string;
  customerName: string;
  customerEmail: string;
  dueDate: string;
  totalPaise: number;
  paidPaise: number;
  balancePaise: number;
  status: InvoiceStatus;
};

export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];

export type PaymentLedgerItem = {
  paymentId: string;
  paidOn: string;
  invoiceNumber: string;
  customerName: string;
  method: PaymentMethod;
  amountPaise: number;
  note: string | null;
};

export type InvoiceSummary = {
  /** Confirmed open balance across BOTH categories (outstanding-due + overdue). */
  receivablesCount: number;
  receivablesPaise: number;
  /** The overdue subset of the receivables. */
  overdueCount: number;
  overduePaise: number;
  paidCount: number;
};

/** An invoice still owes money: partial payments keep it open until fully paid. */
const openBalance = sql`${invoices.paidPaise} < ${invoices.totalPaise}`;

/**
 * Aggregate sums over int4 columns arrive from Postgres as bigint strings
 * (and null for empty groups). Convert through BigInt with a safe-integer
 * guard so whole-paise precision is preserved — no float arithmetic.
 */
function toSafePaise(value: string | number | null): number {
  if (value === null) return 0;
  const amount = BigInt(value);
  if (amount < BigInt(0) || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Monetary aggregate outside the safe paise range.");
  }
  return Number(amount);
}

function searchFilter(q: string | undefined) {
  const search = q?.trim().slice(0, 100);
  if (!search) return undefined;
  const like = `%${search}%`;
  return or(
    ilike(invoices.number, like),
    ilike(customers.name, like),
    ilike(customers.email, like),
  );
}

/**
 * Pagination guard: only positive safe-integer pages are accepted. The bound
 * is computed by exact integer division so the derived offset ((page-1) *
 * PAGE_SIZE) is provably exact — a float multiply could round back inside
 * the safe range and pass a naive isSafeInteger(product) check.
 */
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

/**
 * Rev 4: Outstanding (due today or later) and Overdue (due before today) are
 * mutually exclusive — every confirmed open invoice appears in exactly one,
 * judged against a single `appToday(db)` snapshot.
 */
async function invoicesWhere(db: Db, view: InvoiceView, q: string | undefined) {
  const today = await appToday(db);
  const filters = [];
  if (view === "paid") {
    filters.push(eq(invoices.status, "paid"));
  } else {
    filters.push(eq(invoices.status, "confirmed"), openBalance);
    filters.push(view === "overdue" ? lt(invoices.dueDate, today) : gte(invoices.dueDate, today));
  }
  const search = searchFilter(q);
  if (search) filters.push(search);
  return and(...filters);
}

export type ListInvoicesFilters = { view: InvoiceView; q?: string; page?: number };

export async function listInvoices(db: Db, filters: ListInvoicesFilters): Promise<Page<InvoiceListItem>> {
  const page = resolvePage(filters.page);
  const where = await invoicesWhere(db, filters.view, filters.q);

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
      dueDate: invoices.dueDate,
      totalPaise: invoices.totalPaise,
      paidPaise: invoices.paidPaise,
      balancePaise: sql<number>`${invoices.totalPaise} - ${invoices.paidPaise}`,
      status: invoices.status,
    })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(where)
    .orderBy(
      filters.view === "paid" ? desc(invoices.updatedAt) : asc(invoices.dueDate),
      asc(invoices.id),
    )
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const total = totals.total;
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function invoiceSummary(db: Db): Promise<InvoiceSummary> {
  const today = await appToday(db);
  const [open] = await db
    .select({
      receivablesCount: count(),
      receivablesPaise: sql<string>`coalesce(sum(${invoices.totalPaise} - ${invoices.paidPaise}), 0)`,
      overdueCount: sql<number>`count(*) filter (where ${invoices.dueDate} < ${today})`.mapWith(Number),
      overduePaise: sql<string>`coalesce(sum(${invoices.totalPaise} - ${invoices.paidPaise}) filter (where ${invoices.dueDate} < ${today}), 0)`,
    })
    .from(invoices)
    .where(and(eq(invoices.status, "confirmed"), openBalance));

  const [paid] = await db
    .select({ paidCount: count() })
    .from(invoices)
    .where(eq(invoices.status, "paid"));

  return {
    receivablesCount: open.receivablesCount,
    receivablesPaise: toSafePaise(open.receivablesPaise),
    overdueCount: open.overdueCount,
    overduePaise: toSafePaise(open.overduePaise),
    paidCount: paid.paidCount,
  };
}

export type ListPaymentsFilters = { q?: string; page?: number };

export async function listPayments(db: Db, filters: ListPaymentsFilters): Promise<Page<PaymentLedgerItem>> {
  const page = resolvePage(filters.page);
  const where = searchFilter(filters.q);

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
      invoiceNumber: invoices.number,
      customerName: customers.name,
      method: payments.method,
      amountPaise: payments.amountPaise,
      note: payments.note,
    })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(where)
    // The ledger shows the actual payment date first; entry recency only
    // breaks ties between payments made on the same day.
    .orderBy(desc(payments.paidOn), desc(payments.createdAt), desc(payments.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const total = totals.total;
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export type InvoiceRef = { invoiceId?: string; invoiceNumber?: string };

export async function resolveInvoiceRef(db: Db, ref: InvoiceRef): Promise<{ id: string } | null> {
  if (ref.invoiceId) {
    const [row] = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, ref.invoiceId));
    return row ?? null;
  }
  if (ref.invoiceNumber) {
    const [row] = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.number, ref.invoiceNumber));
    return row ?? null;
  }
  return null;
}
