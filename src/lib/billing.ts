import { and, asc, count, eq, gt, inArray, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import {
  discountProducts,
  discounts,
  events,
  invoiceLines,
  invoices,
  plans,
  subscriptionDiscounts,
  subscriptionLineTaxes,
  subscriptionLines,
  subscriptions,
  taxRules,
} from "@/db/schema";
import { appNow } from "./clock";
import { computeInvoice, type DiscountRule, type InvoiceComputation, type InvoiceLineInput } from "./compute-invoice";
import { addDays, nextBillingDateAfter, toBusinessDate } from "./dates";
import { nextNumber } from "./numbers";

const BATCH_SIZE = 200;
const PARALLEL_SUBSCRIPTIONS = 8;

export type BillingSkip = { subscriptionId: string; number: string; reason: string };

export type BillingResult = {
  processed: number;
  created: number;
  billedPaise: number;
  skipped: BillingSkip[];
  failed: BillingSkip[]; // stays due, so the next run tries again
  hasMore: boolean;
  cursor?: string; // pass to the next call to continue a batched run
};

async function loadLines(db: Db, subscriptionId: string): Promise<InvoiceLineInput[]> {
  const lines = await db
    .select()
    .from(subscriptionLines)
    .where(eq(subscriptionLines.subscriptionId, subscriptionId))
    .orderBy(asc(subscriptionLines.productId), asc(subscriptionLines.id)); // the portal's preview uses this order too
  if (lines.length === 0) return [];

  const taxes = await db
    .select({ lineId: subscriptionLineTaxes.lineId, id: taxRules.id, name: taxRules.name, rateBps: taxRules.rateBps })
    .from(subscriptionLineTaxes)
    .innerJoin(taxRules, eq(subscriptionLineTaxes.taxRuleId, taxRules.id))
    .where(inArray(subscriptionLineTaxes.lineId, lines.map((line) => line.id)));

  return lines.map((line) => ({
    productId: line.productId,
    description: line.description,
    quantity: line.quantity,
    unitPricePaise: line.unitPricePaise,
    taxes: taxes
      .filter((tax) => tax.lineId === line.id)
      .map(({ id, name, rateBps }) => ({ id, name, rateBps })),
  }));
}

/** The discount rules that could apply: attached whole-subscription ones, plus product ones for these lines. */
export async function loadDiscounts(db: Db, subscriptionId: string, lines: InvoiceLineInput[]): Promise<DiscountRule[]> {
  const productIds = [...new Set(lines.map((line) => line.productId))];
  const productLinks = productIds.length
    ? await db
        .select({ discountId: discountProducts.discountId, productId: discountProducts.productId })
        .from(discountProducts)
        .innerJoin(discounts, eq(discountProducts.discountId, discounts.id))
        .where(and(inArray(discountProducts.productId, productIds), eq(discounts.scope, "product")))
    : [];
  const attached = await db
    .select({ discountId: subscriptionDiscounts.discountId })
    .from(subscriptionDiscounts)
    .innerJoin(discounts, eq(subscriptionDiscounts.discountId, discounts.id))
    .where(and(eq(subscriptionDiscounts.subscriptionId, subscriptionId), eq(discounts.scope, "subscription")));

  const ids = [...new Set([...productLinks.map((link) => link.discountId), ...attached.map((row) => row.discountId)])];
  if (ids.length === 0) return [];

  const rows = await db.select().from(discounts).where(inArray(discounts.id, ids)).orderBy(asc(discounts.createdAt), asc(discounts.id));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    value: row.value,
    scope: row.scope,
    productIds: productLinks.filter((link) => link.discountId === row.id).map((link) => link.productId),
    minPurchasePaise: row.minPurchasePaise,
    minQuantity: row.minQuantity,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    usageLimit: row.usageLimit,
    usageCount: row.usageCount,
  }));
}

/** What the next invoice will look like. Writes nothing, so previews never use up a discount. */
export async function previewNextInvoice(
  db: Db,
  subscriptionId: string,
): Promise<{ billingDate: string; computation: InvoiceComputation } | null> {
  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId));
  if (!subscription || subscription.status === "closed") return null;

  const isRunning = subscription.status === "active" || subscription.status === "paused";
  const billingDate = isRunning ? subscription.nextBillingDate : subscription.startDate;
  if (!billingDate || (subscription.expiryDate && billingDate >= subscription.expiryDate)) return null;

  const lines = await loadLines(db, subscriptionId);
  const rules = await loadDiscounts(db, subscriptionId, lines);
  return { billingDate, computation: computeInvoice({ lines, discounts: rules, on: billingDate }) };
}

type PeriodOutcome =
  | { kind: "created"; totalPaise: number }
  | { kind: "skipped"; reason: string; keepGoing: boolean }
  | { kind: "stop" };

/** Bills one period in one transaction, so an invoice and its moved-on billing date always save together. */
async function billNextPeriod(db: Db, subscriptionId: string, today: string, occurredAt: Date): Promise<PeriodOutcome> {
  return db.transaction(async (tx) => {
    // The row lock makes overlapping runs wait here, then see the billing date the first run moved on.
    const [row] = await tx
      .select({ subscription: subscriptions, frequency: plans.frequency })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(eq(subscriptions.id, subscriptionId))
      .for("update", { of: subscriptions });
    if (!row) return { kind: "stop" } as const;

    const { subscription, frequency } = row;
    const periodStart = subscription.nextBillingDate;
    if (subscription.status !== "active" || !periodStart || periodStart > today) return { kind: "stop" } as const;

    if (subscription.expiryDate && periodStart >= subscription.expiryDate) {
      await tx.update(subscriptions).set({ nextBillingDate: null }).where(eq(subscriptions.id, subscriptionId));
      return { kind: "skipped", reason: "Reached expiry date", keepGoing: false } as const;
    }

    const lines = await loadLines(tx, subscriptionId);
    if (lines.length === 0) return { kind: "skipped", reason: "No product lines", keepGoing: false } as const;

    const nextDate = nextBillingDateAfter(subscription.startDate, frequency, periodStart);
    const moveOn = () =>
      tx.update(subscriptions).set({ nextBillingDate: nextDate }).where(eq(subscriptions.id, subscriptionId));

    const [alreadyBilled] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.subscriptionId, subscriptionId),
          eq(invoices.periodStart, periodStart),
          ne(invoices.status, "cancelled"),
        ),
      );
    if (alreadyBilled) {
      await moveOn();
      return { kind: "skipped", reason: "Already billed for this period", keepGoing: true } as const;
    }

    const rules = await loadDiscounts(tx, subscriptionId, lines);
    const limitedIds = rules.filter((rule) => rule.usageLimit !== null).map((rule) => rule.id).sort();
    if (limitedIds.length > 0) {
      // Lock limited discounts in a fixed order so two invoices can't both take the last use.
      const fresh = await tx
        .select({ id: discounts.id, usageCount: discounts.usageCount })
        .from(discounts)
        .where(inArray(discounts.id, limitedIds))
        .orderBy(asc(discounts.id))
        .for("update");
      for (const rule of rules) {
        const latest = fresh.find((item) => item.id === rule.id);
        if (latest) rule.usageCount = latest.usageCount;
      }
    }

    const computation = computeInvoice({ lines, discounts: rules, on: periodStart });
    // Taken last, inside the transaction, so a rollback or a skipped period can't leave a gap in the numbers.
    const invoiceNumber = await nextNumber(tx, "INV");
    // No onConflict here: the checks above and the unique indexes make any clash a real error worth reporting.
    const [invoice] = await tx
      .insert(invoices)
      .values({
        number: invoiceNumber,
        subscriptionId,
        customerId: subscription.customerId,
        status: "draft",
        periodStart,
        periodEnd: addDays(nextDate, -1),
        issueDate: periodStart,
        dueDate: addDays(periodStart, subscription.paymentTermsDays),
        subtotalPaise: computation.subtotalPaise,
        discountPaise: computation.discountPaise,
        taxPaise: computation.taxPaise,
        totalPaise: computation.totalPaise,
        breakdown: computation,
      })
      .returning({ id: invoices.id });

    await tx.insert(invoiceLines).values(
      computation.lines.map((line) => ({
        invoiceId: invoice.id,
        productId: line.productId,
        description: line.description,
        quantity: line.quantity,
        unitPricePaise: line.unitPricePaise,
        subtotalPaise: line.subtotalPaise,
        discountPaise: line.discountPaise,
        taxPaise: line.taxPaise,
        totalPaise: line.totalPaise,
      })),
    );

    const usedLimited = computation.appliedDiscounts.map((applied) => applied.id).filter((id) => limitedIds.includes(id));
    if (usedLimited.length > 0) {
      await tx
        .update(discounts)
        .set({ usageCount: sql`${discounts.usageCount} + 1` })
        .where(inArray(discounts.id, usedLimited));
    }

    await moveOn();
    await tx.insert(events).values({
      entityType: "subscription",
      entityId: subscriptionId,
      type: "invoice_created",
      note: `Invoice ${invoiceNumber} for ${periodStart}`,
      occurredAt,
      meta: { invoiceId: invoice.id, number: invoiceNumber, totalPaise: computation.totalPaise },
    });
    return { kind: "created", totalPaise: computation.totalPaise } as const;
  });
}

/** Bills every due period for one subscription, catching up if the date has jumped ahead. */
async function billSubscription(
  db: Db,
  subscription: { id: string; number: string; status: string },
  today: string,
  occurredAt: Date,
  result: BillingResult,
) {
  if (subscription.status === "paused") {
    result.skipped.push({ subscriptionId: subscription.id, number: subscription.number, reason: "Paused" });
    return;
  }

  for (;;) {
    const outcome = await billNextPeriod(db, subscription.id, today, occurredAt);

    if (outcome.kind === "stop") return;
    if (outcome.kind === "created") {
      result.created += 1;
      result.billedPaise += outcome.totalPaise;
      continue;
    }
    result.skipped.push({ subscriptionId: subscription.id, number: subscription.number, reason: outcome.reason });
    if (!outcome.keepGoing) return;
  }
}

/** Bills whatever is due for one subscription. Returns how many invoices were created. */
export async function billDueSubscription(db: Db, subscriptionId: string, today: string, occurredAt: Date): Promise<number> {
  const [subscription] = await db
    .select({ id: subscriptions.id, number: subscriptions.number, status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId));
  if (!subscription) return 0;

  const result: BillingResult = { processed: 1, created: 0, billedPaise: 0, skipped: [], failed: [], hasMore: false };
  await billSubscription(db, subscription, today, occurredAt, result);
  return result.created;
}

async function runBatch(db: Db, today: string, occurredAt: Date, limit: number, cursor?: string): Promise<BillingResult> {
  const due = await db
    .select({ id: subscriptions.id, number: subscriptions.number, status: subscriptions.status })
    .from(subscriptions)
    .where(
      and(
        or(eq(subscriptions.status, "active"), eq(subscriptions.status, "paused")),
        isNotNull(subscriptions.nextBillingDate),
        lte(subscriptions.nextBillingDate, today),
        cursor ? gt(subscriptions.id, cursor) : undefined,
      ),
    )
    .orderBy(asc(subscriptions.id))
    .limit(limit + 1);

  const batch = due.slice(0, limit);
  const result: BillingResult = {
    processed: batch.length,
    created: 0,
    billedPaise: 0,
    skipped: [],
    failed: [],
    hasMore: due.length > limit,
    cursor: batch.at(-1)?.id,
  };

  let next = 0;
  const worker = async () => {
    while (next < batch.length) {
      const subscription = batch[next];
      next += 1;
      try {
        await billSubscription(db, subscription, today, occurredAt, result);
      } catch (error) {
        // One bad subscription shouldn't stop the rest of the run.
        console.error(`Billing failed for ${subscription.number}`, error);
        result.failed.push({ subscriptionId: subscription.id, number: subscription.number, reason: "Unexpected error" });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_SUBSCRIPTIONS, batch.length) }, worker));
  return result;
}

/** How many subscriptions the next billing run will go through, for its progress bar. */
export async function countDueSubscriptions(db: Db, today: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(subscriptions)
    .where(
      and(
        or(eq(subscriptions.status, "active"), eq(subscriptions.status, "paused")),
        isNotNull(subscriptions.nextBillingDate),
        lte(subscriptions.nextBillingDate, today),
      ),
    );
  return row.total;
}

/**
 * Creates draft invoices for everything due. Safe to run any number of times.
 * With `limit`, handles one batch: call again with the returned `cursor` while `hasMore` is true, which
 * gives the screen live progress and keeps each request short. Without `limit`, it runs to the end.
 */
export async function runBilling(
  db: Db,
  options: { today?: string; limit?: number; cursor?: string } = {},
): Promise<BillingResult> {
  const now = await appNow(db);
  const today = options.today ?? toBusinessDate(now);

  if (options.limit !== undefined) return runBatch(db, today, now, options.limit, options.cursor);

  const total: BillingResult = { processed: 0, created: 0, billedPaise: 0, skipped: [], failed: [], hasMore: false };
  let cursor = options.cursor;
  for (;;) {
    const batch = await runBatch(db, today, now, BATCH_SIZE, cursor);
    total.processed += batch.processed;
    total.created += batch.created;
    total.billedPaise += batch.billedPaise;
    total.skipped.push(...batch.skipped);
    total.failed.push(...batch.failed);
    cursor = batch.cursor;
    if (!batch.hasMore) return total;
  }
}
