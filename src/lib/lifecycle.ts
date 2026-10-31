import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { events, plans, subscriptions } from "@/db/schema";
import { billDueSubscription } from "./billing";
import { appNow } from "./clock";
import {
  addDays,
  addPeriods,
  type BillingFrequency,
  daysBetween,
  firstBillingDateOnOrAfter,
  periodsUntil,
  toBusinessDate,
} from "./dates";
import { transitionSubscription, TransitionError } from "./transition";

type SubscriptionRef = { subscriptionId: string; number: string };

export type LifecycleResult = {
  closed: SubscriptionRef[];
  needsRenewal: SubscriptionRef[]; // reached expiry on a plan that doesn't close itself, and can be renewed
  needsClosing: SubscriptionRef[]; // reached expiry on a plan that can't be renewed or close itself
  failed: (SubscriptionRef & { reason: string })[];
  invoicesCreated: number;
};

/**
 * Applies what each plan says should happen at expiry. Safe to run repeatedly.
 * Auto-close plans get any remaining periods billed first, so closing never skips an invoice.
 */
export async function runLifecycle(db: Db, options: { today?: string } = {}): Promise<LifecycleResult> {
  const now = await appNow(db);
  const today = options.today ?? toBusinessDate(now);
  const result: LifecycleResult = { closed: [], needsRenewal: [], needsClosing: [], failed: [], invoicesCreated: 0 };

  const expired = await db
    .select({ id: subscriptions.id, number: subscriptions.number, autoClose: plans.autoClose, canRenew: plans.canRenew })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(
      and(
        inArray(subscriptions.status, ["active", "paused"]),
        isNotNull(subscriptions.expiryDate),
        lte(subscriptions.expiryDate, today),
      ),
    );

  for (const subscription of expired) {
    const ref = { subscriptionId: subscription.id, number: subscription.number };
    if (!subscription.autoClose) {
      (subscription.canRenew ? result.needsRenewal : result.needsClosing).push(ref);
      continue;
    }
    try {
      result.invoicesCreated += await billDueSubscription(db, subscription.id, today, now);
      await transitionSubscription(db, { id: subscription.id, to: "closed", note: "Closed automatically at expiry" });
      result.closed.push(ref);
    } catch (error) {
      // One bad subscription shouldn't stop the others, and it stays listed until it's fixed.
      console.error(`Lifecycle failed for ${subscription.number}`, error);
      result.failed.push({ ...ref, reason: error instanceof TransitionError ? error.message : "Unexpected error" });
    }
  }
  return result;
}

/**
 * Whole-period terms count from the start date, so they stay on the billing cycle after short months.
 * Any other term repeats its exact number of days.
 */
function nextExpiry(start: string, frequency: BillingFrequency, termStart: string, expiry: string): string {
  const periodsToTermStart = periodsUntil(start, frequency, termStart);
  const periodsToExpiry = periodsUntil(start, frequency, expiry);
  const isWholePeriods =
    addPeriods(start, frequency, periodsToTermStart) === termStart &&
    addPeriods(start, frequency, periodsToExpiry) === expiry &&
    periodsToExpiry > periodsToTermStart;

  return isWholePeriods
    ? addPeriods(start, frequency, 2 * periodsToExpiry - periodsToTermStart)
    : addDays(expiry, daysBetween(termStart, expiry));
}

/** Extends a subscription by the length of its current term, and restarts billing if expiry had stopped it. */
export async function renewSubscription(
  db: Db,
  input: { id: string; note?: string; actorId?: string },
): Promise<{ expiryDate: string }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ subscription: subscriptions, plan: plans })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(eq(subscriptions.id, input.id))
      .for("update", { of: subscriptions });
    if (!row) throw new TransitionError("Subscription not found.");

    const { subscription, plan } = row;
    if (subscription.status !== "active" && subscription.status !== "paused") {
      throw new TransitionError(`A subscription that is ${subscription.status} can't be renewed.`);
    }
    if (!plan.canRenew) throw new TransitionError("This plan can't be renewed.");
    const oldExpiry = subscription.expiryDate;
    if (!oldExpiry) throw new TransitionError("This subscription has no expiry date to extend.");

    const termStart = subscription.termStartDate ?? subscription.startDate;
    const expiryDate = nextExpiry(subscription.startDate, plan.frequency, termStart, oldExpiry);

    await tx
      .update(subscriptions)
      .set({
        expiryDate,
        termStartDate: oldExpiry,
        nextBillingDate:
          subscription.nextBillingDate ??
          firstBillingDateOnOrAfter(subscription.startDate, plan.frequency, oldExpiry),
      })
      .where(eq(subscriptions.id, input.id));
    await tx.insert(events).values({
      entityType: "subscription",
      entityId: input.id,
      type: "renewed",
      note: input.note,
      actorId: input.actorId,
      occurredAt: await appNow(tx),
      meta: { previousExpiry: oldExpiry, expiryDate },
    });
    return { expiryDate };
  });
}
