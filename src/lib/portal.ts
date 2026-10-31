import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import {
  customers,
  events,
  invoiceLines,
  invoices,
  payments,
  plans,
  productTaxes,
  products,
  subscriptionLineTaxes,
  subscriptionLines,
  subscriptions,
  taxRules,
} from "@/db/schema";
import { loadDiscounts } from "./billing";
import { appNow, appToday } from "./clock";
import { computeInvoice, type InvoiceComputation, type InvoiceLineInput, type TaxInput } from "./compute-invoice";
import { firstBillingDateOnOrAfter } from "./dates";
import { formatMoney } from "./money";
import { transitionSubscription } from "./transition";

/*
 * Everything a customer can see or do. Every function takes the customer's id and filters by it,
 * so another customer's record looks exactly like one that doesn't exist.
 * Callers get that id from the session with getPortalCustomerId, never from the request.
 */

/** Its message is safe to show to the customer. */
export class PortalError extends Error {}
export class PortalNotFoundError extends PortalError {}

export type PortalChange = {
  quantities?: Record<string, number>;
  addAddons?: string[];
  removeLines?: string[];
};

const MAX_QUANTITY = 100_000;
const VISIBLE_INVOICES = ["confirmed", "paid", "cancelled"] as const;
const LIST_LIMIT = 200;

type PortalLine = InvoiceLineInput & { lineId: string; isAddon: boolean };

export async function getPortalCustomerId(db: Db, userId: string): Promise<string | null> {
  const [row] = await db.select({ id: customers.id }).from(customers).where(eq(customers.userId, userId));
  return row?.id ?? null;
}

async function loadLines(db: Db, subscriptionId: string): Promise<PortalLine[]> {
  const rows = await db
    .select({
      lineId: subscriptionLines.id,
      productId: subscriptionLines.productId,
      description: subscriptionLines.description,
      quantity: subscriptionLines.quantity,
      unitPricePaise: subscriptionLines.unitPricePaise,
      isAddon: products.isAddon,
    })
    .from(subscriptionLines)
    .innerJoin(products, eq(subscriptionLines.productId, products.id))
    .where(eq(subscriptionLines.subscriptionId, subscriptionId))
    .orderBy(asc(products.isAddon), asc(subscriptionLines.id));
  if (rows.length === 0) return [];

  const taxes = await db
    .select({ lineId: subscriptionLineTaxes.lineId, id: taxRules.id, name: taxRules.name, rateBps: taxRules.rateBps })
    .from(subscriptionLineTaxes)
    .innerJoin(taxRules, eq(subscriptionLineTaxes.taxRuleId, taxRules.id))
    .where(inArray(subscriptionLineTaxes.lineId, rows.map((row) => row.lineId)));

  return rows.map((row) => ({
    ...row,
    taxes: taxes.filter((tax) => tax.lineId === row.lineId).map(({ id, name, rateBps }) => ({ id, name, rateBps })),
  }));
}

async function findOwned(db: Db, customerId: string, subscriptionId: string, lock = false) {
  const query = db
    .select({ subscription: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.customerId, customerId), ne(subscriptions.status, "draft")));
  const [row] = await (lock ? query.for("update", { of: subscriptions }) : query);
  return row ?? null;
}

type Owned = NonNullable<Awaited<ReturnType<typeof findOwned>>>;

/** The date of the next invoice, or null when none is coming. Matches what the billing run and resuming do. */
function nextBillingDate({ subscription, plan }: Owned, today: string): string | null {
  let date = subscription.nextBillingDate;
  if (subscription.status === "paused") {
    const resumeDate = firstBillingDateOnOrAfter(subscription.startDate, plan.frequency, today);
    if (!date || date < resumeDate) date = resumeDate;
  } else if (subscription.status === "quotation" || subscription.status === "confirmed") {
    date ??= subscription.startDate;
  } else if (subscription.status === "closed") {
    return null;
  }
  if (!date || (subscription.expiryDate && date >= subscription.expiryDate)) return null;
  return date;
}

async function compute(db: Db, subscriptionId: string, lines: InvoiceLineInput[], on: string): Promise<InvoiceComputation> {
  return computeInvoice({ lines, discounts: await loadDiscounts(db, subscriptionId, lines), on });
}

function assertChangeable(owned: Owned, billingDate: string | null): asserts billingDate is string {
  const { status } = owned.subscription;
  if (status !== "active" && status !== "paused") {
    throw new PortalError(`A subscription that is ${status} can't be changed.`);
  }
  if (!billingDate) throw new PortalError("This subscription has no more invoices coming, so it can't be changed.");
}

/** Applies a requested change to the lines in memory, refusing anything the customer isn't allowed to do. */
async function applyToLines(db: Db, owned: Owned, lines: PortalLine[], change: PortalChange) {
  const quantities = change.quantities ?? {};
  const removals = new Set(change.removeLines ?? []);
  const notes: string[] = [];
  const updates: { lineId: string; quantity: number }[] = [];

  for (const [lineId, quantity] of Object.entries(quantities)) {
    const line = lines.find((item) => item.lineId === lineId);
    if (!line) throw new PortalError("That line isn't on this subscription.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new PortalError("Enter a whole number of seats between 1 and 1,00,000.");
    }
    if (quantity !== line.quantity) {
      updates.push({ lineId, quantity });
      notes.push(`${line.description} changed from ${line.quantity} to ${quantity}`);
    }
  }

  for (const lineId of removals) {
    const line = lines.find((item) => item.lineId === lineId);
    if (!line) throw new PortalError("That line isn't on this subscription.");
    if (!line.isAddon) throw new PortalError("Only add-ons can be removed.");
    notes.push(`Removed ${line.description}`);
  }

  const kept = lines.filter((line) => !removals.has(line.lineId));
  const next: InvoiceLineInput[] = kept.map((line) => ({
    productId: line.productId,
    description: line.description,
    quantity: quantities[line.lineId] ?? line.quantity,
    unitPricePaise: line.unitPricePaise,
    taxes: line.taxes,
  }));

  const touchesSeats = updates.some(({ lineId }) => !lines.find((line) => line.lineId === lineId)?.isAddon);
  if (touchesSeats) {
    const seats = kept.filter((line) => !line.isAddon).reduce((sum, line) => sum + (quantities[line.lineId] ?? line.quantity), 0);
    if (seats < owned.plan.minQuantity) throw new PortalError(`This plan needs at least ${owned.plan.minQuantity} seats.`);
  }

  const additions: (InvoiceLineInput & { taxes: TaxInput[] })[] = [];
  const addIds = [...new Set(change.addAddons ?? [])];
  if (addIds.length > 0) {
    const rows = await db.select().from(products).where(and(inArray(products.id, addIds), eq(products.isAddon, true)));
    if (rows.length !== addIds.length) throw new PortalError("That product isn't an add-on.");
    const taxes = await db
      .select({ productId: productTaxes.productId, id: taxRules.id, name: taxRules.name, rateBps: taxRules.rateBps })
      .from(productTaxes)
      .innerJoin(taxRules, eq(productTaxes.taxRuleId, taxRules.id))
      .where(and(inArray(productTaxes.productId, addIds), eq(taxRules.active, true)));
    for (const product of rows) {
      if (kept.some((line) => line.productId === product.id)) throw new PortalError(`${product.name} is already on this subscription.`);
      additions.push({
        productId: product.id,
        description: product.name,
        quantity: 1,
        unitPricePaise: product.salesPricePaise,
        taxes: taxes.filter((tax) => tax.productId === product.id).map(({ id, name, rateBps }) => ({ id, name, rateBps })),
      });
      notes.push(`Added ${product.name}`);
    }
  }

  return { next: [...next, ...additions], updates, removals: [...removals], additions, notes };
}

export type PortalPreview = {
  billingDate: string;
  current: InvoiceComputation;
  next: InvoiceComputation;
};

/** What the next invoice would be with this change. Saves nothing. */
export async function previewPortalChange(db: Db, customerId: string, subscriptionId: string, change: PortalChange): Promise<PortalPreview> {
  const owned = await findOwned(db, customerId, subscriptionId);
  if (!owned) throw new PortalNotFoundError("Subscription not found.");
  const billingDate = nextBillingDate(owned, await appToday(db));
  assertChangeable(owned, billingDate);

  const lines = await loadLines(db, subscriptionId);
  const { next } = await applyToLines(db, owned, lines, change);
  return {
    billingDate,
    current: await compute(db, subscriptionId, lines, billingDate),
    next: await compute(db, subscriptionId, next, billingDate),
  };
}

/**
 * Saves a change the customer has seen the price of. `expectedTotalPaise` is the total they were shown,
 * so they're never charged a different amount from the one they agreed to. Issued invoices don't change.
 */
export async function applyPortalChange(
  db: Db,
  input: { customerId: string; subscriptionId: string; change: PortalChange; expectedTotalPaise: number; actorId: string },
): Promise<PortalPreview> {
  const { customerId, subscriptionId, change, expectedTotalPaise, actorId } = input;
  return db.transaction(async (tx) => {
    const owned = await findOwned(tx, customerId, subscriptionId, true);
    if (!owned) throw new PortalNotFoundError("Subscription not found.");
    const now = await appNow(tx);
    const billingDate = nextBillingDate(owned, await appToday(tx));
    assertChangeable(owned, billingDate);

    const lines = await loadLines(tx, subscriptionId);
    const { next, updates, removals, additions, notes } = await applyToLines(tx, owned, lines, change);
    if (notes.length === 0) throw new PortalError("Change something first.");

    const computed = await compute(tx, subscriptionId, next, billingDate);
    if (computed.totalPaise !== expectedTotalPaise) {
      throw new PortalError(`The price has changed to ${formatMoney(computed.totalPaise)}. Check it and confirm again.`);
    }

    for (const { lineId, quantity } of updates) {
      await tx.update(subscriptionLines).set({ quantity }).where(eq(subscriptionLines.id, lineId));
    }
    if (removals.length > 0) await tx.delete(subscriptionLines).where(inArray(subscriptionLines.id, removals));
    for (const addition of additions) {
      const [line] = await tx
        .insert(subscriptionLines)
        .values({
          subscriptionId,
          productId: addition.productId,
          description: addition.description,
          quantity: addition.quantity,
          unitPricePaise: addition.unitPricePaise,
        })
        .returning({ id: subscriptionLines.id });
      if (addition.taxes.length > 0) {
        await tx.insert(subscriptionLineTaxes).values(addition.taxes.map((tax) => ({ lineId: line.id, taxRuleId: tax.id })));
      }
    }
    await tx.insert(events).values({
      entityType: "subscription",
      entityId: subscriptionId,
      type: "customer_changed_plan",
      note: `${notes.join(". ")}. Next invoice ${formatMoney(computed.totalPaise)}.`,
      actorId,
      occurredAt: now,
    });
    return { billingDate, current: await compute(tx, subscriptionId, lines, billingDate), next: computed };
  });
}

export async function pausePortalSubscription(db: Db, input: { customerId: string; subscriptionId: string; actorId: string }) {
  if (!(await findOwned(db, input.customerId, input.subscriptionId))) throw new PortalNotFoundError("Subscription not found.");
  await transitionSubscription(db, { id: input.subscriptionId, to: "paused", actorId: input.actorId, note: "Paused by the customer" });
}

export async function resumePortalSubscription(db: Db, input: { customerId: string; subscriptionId: string; actorId: string }) {
  if (!(await findOwned(db, input.customerId, input.subscriptionId))) throw new PortalNotFoundError("Subscription not found.");
  await transitionSubscription(db, { id: input.subscriptionId, to: "active", actorId: input.actorId, note: "Resumed by the customer" });
}

export async function listPortalSubscriptions(db: Db, customerId: string) {
  return db
    .select({
      id: subscriptions.id,
      number: subscriptions.number,
      status: subscriptions.status,
      planName: plans.name,
      frequency: plans.frequency,
      nextBillingDate: subscriptions.nextBillingDate,
      expiryDate: subscriptions.expiryDate,
      amountPaise: sql<number>`coalesce((
        select sum(${subscriptionLines.quantity}::bigint * ${subscriptionLines.unitPricePaise})
        from ${subscriptionLines} where ${subscriptionLines.subscriptionId} = ${subscriptions.id}
      ), 0)`.mapWith(Number),
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(and(eq(subscriptions.customerId, customerId), ne(subscriptions.status, "draft")))
    .orderBy(desc(subscriptions.createdAt), asc(subscriptions.id))
    .limit(LIST_LIMIT);
}

export type PortalSubscriptionDetail = NonNullable<Awaited<ReturnType<typeof getPortalSubscription>>>;

export async function getPortalSubscription(db: Db, customerId: string, subscriptionId: string) {
  const owned = await findOwned(db, customerId, subscriptionId);
  if (!owned) return null;
  const { subscription, plan } = owned;
  const today = await appToday(db);
  const billingDate = nextBillingDate(owned, today);
  const lines = await loadLines(db, subscriptionId);
  const addons = await db.select({ id: products.id, name: products.name, salesPricePaise: products.salesPricePaise }).from(products).where(eq(products.isAddon, true)).orderBy(asc(products.name));
  const isRunning = subscription.status === "active" || subscription.status === "paused";

  return {
    id: subscription.id,
    number: subscription.number,
    status: subscription.status,
    startDate: subscription.startDate,
    expiryDate: subscription.expiryDate,
    planName: plan.name,
    frequency: plan.frequency,
    minQuantity: plan.minQuantity,
    canPause: plan.canPause,
    canChange: isRunning && billingDate !== null,
    lines: lines.map(({ lineId, description, quantity, unitPricePaise, isAddon, productId }) => ({ lineId, description, quantity, unitPricePaise, isAddon, productId })),
    addons,
    nextInvoice: billingDate ? { billingDate, computation: await compute(db, subscriptionId, lines, billingDate) } : null,
  };
}

const balance = sql<number>`${invoices.totalPaise} - ${invoices.paidPaise}`.mapWith(Number);

export async function listPortalInvoices(db: Db, customerId: string) {
  const today = await appToday(db);
  const rows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      totalPaise: invoices.totalPaise,
      balancePaise: balance,
    })
    .from(invoices)
    .where(and(eq(invoices.customerId, customerId), inArray(invoices.status, [...VISIBLE_INVOICES])))
    .orderBy(desc(invoices.issueDate), desc(invoices.number))
    .limit(LIST_LIMIT);
  return rows.map((row) => ({ ...row, isOverdue: row.status === "confirmed" && row.balancePaise > 0 && row.dueDate < today }));
}

export async function getPortalInvoice(db: Db, customerId: string, invoiceId: string) {
  const [invoice] = await db
    .select({ invoice: invoices, subscriptionNumber: subscriptions.number })
    .from(invoices)
    .innerJoin(subscriptions, eq(invoices.subscriptionId, subscriptions.id))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.customerId, customerId), inArray(invoices.status, [...VISIBLE_INVOICES])));
  if (!invoice) return null;

  const today = await appToday(db);
  const [lines, paid] = await Promise.all([
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)).orderBy(asc(invoiceLines.id)),
    db.select().from(payments).where(eq(payments.invoiceId, invoiceId)).orderBy(desc(payments.paidOn)),
  ]);
  const row = invoice.invoice;
  const balancePaise = row.totalPaise - row.paidPaise;
  const breakdown = (row.breakdown ?? {}) as Partial<InvoiceComputation>;
  return {
    ...row,
    subscriptionNumber: invoice.subscriptionNumber,
    balancePaise,
    isOverdue: row.status === "confirmed" && balancePaise > 0 && row.dueDate < today,
    lines,
    payments: paid,
    taxes: breakdown.taxes ?? [],
    appliedDiscounts: breakdown.appliedDiscounts ?? [],
  };
}

export async function listPortalPayments(db: Db, customerId: string) {
  return db
    .select({
      id: payments.id,
      method: payments.method,
      amountPaise: payments.amountPaise,
      paidOn: payments.paidOn,
      invoiceId: invoices.id,
      invoiceNumber: invoices.number,
    })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(eq(invoices.customerId, customerId))
    .orderBy(desc(payments.paidOn), desc(payments.id))
    .limit(LIST_LIMIT);
}

export async function getPortalOverview(db: Db, customerId: string) {
  const today = await appToday(db);
  const [totals] = await db
    .select({
      owedPaise: sql<number>`coalesce(sum(${invoices.totalPaise} - ${invoices.paidPaise}), 0)`.mapWith(Number),
      overduePaise: sql<number>`coalesce(sum(${invoices.totalPaise} - ${invoices.paidPaise}) filter (where ${invoices.dueDate} < ${today}), 0)`.mapWith(Number),
      overdueCount: sql<number>`count(*) filter (where ${invoices.dueDate} < ${today})`.mapWith(Number),
    })
    .from(invoices)
    .where(and(eq(invoices.customerId, customerId), eq(invoices.status, "confirmed"), sql`${invoices.paidPaise} < ${invoices.totalPaise}`));

  const list = await listPortalSubscriptions(db, customerId);
  const soonest = list
    .filter((row) => row.status === "active" && row.nextBillingDate && !(row.expiryDate && row.nextBillingDate >= row.expiryDate))
    .sort((a, b) => a.nextBillingDate!.localeCompare(b.nextBillingDate!))[0];

  let nextInvoice = null;
  if (soonest) {
    const lines = await loadLines(db, soonest.id);
    nextInvoice = {
      subscriptionId: soonest.id,
      number: soonest.number,
      planName: soonest.planName,
      billingDate: soonest.nextBillingDate!,
      computation: await compute(db, soonest.id, lines, soonest.nextBillingDate!),
    };
  }

  return { today, ...totals, subscriptions: list, nextInvoice };
}
