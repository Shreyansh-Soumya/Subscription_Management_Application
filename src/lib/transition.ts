import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { events, invoices, plans, subscriptions } from "@/db/schema";
import { billDueSubscription } from "./billing";
import { appNow } from "./clock";
import { firstBillingDateOnOrAfter, toBusinessDate } from "./dates";
import {
  checkInvoiceTransition,
  checkSubscriptionTransition,
  type InvoiceStatus,
  type SubscriptionStatus,
} from "./status";

/** Its message is safe to show to the user. */
export class TransitionError extends Error {}

type TransitionInput<Status> = {
  id: string;
  to: Status;
  note?: string;
  actorId?: string;
};

/** The only way to change a subscription's status. Checks the rules and writes the timeline event. */
export async function transitionSubscription(db: Db, input: TransitionInput<SubscriptionStatus>): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ subscription: subscriptions, plan: plans })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(eq(subscriptions.id, input.id))
      .for("update", { of: subscriptions });
    if (!row) throw new TransitionError("Subscription not found.");

    const now = await appNow(tx);
    const from = row.subscription.status;
    const today = toBusinessDate(now);
    const check = checkSubscriptionTransition(from, input.to, {
      plan: row.plan,
      today,
      quoteValidUntil: row.subscription.quoteValidUntil,
      expiryDate: row.subscription.expiryDate,
    });
    if (!check.ok) throw new TransitionError(check.reason);

    // Bill what is already due first, because resuming skips everything up to the resume date.
    if (input.to === "paused") await billDueSubscription(tx, input.id, today, now);

    const [{ nextBillingDate: currentBillingDate }] = await tx
      .select({ nextBillingDate: subscriptions.nextBillingDate })
      .from(subscriptions)
      .where(eq(subscriptions.id, input.id));
    let nextBillingDate = currentBillingDate;
    if (from === "confirmed" && input.to === "active") {
      nextBillingDate ??= row.subscription.startDate;
    } else if (from === "paused" && input.to === "active") {
      // Resuming continues from the next billing date, so the paused months aren't billed.
      const resumeDate = firstBillingDateOnOrAfter(row.subscription.startDate, row.plan.frequency, today);
      if (!nextBillingDate || nextBillingDate < resumeDate) nextBillingDate = resumeDate;
    }

    await tx.update(subscriptions).set({ status: input.to, nextBillingDate }).where(eq(subscriptions.id, input.id));
    await tx.insert(events).values({
      entityType: "subscription",
      entityId: input.id,
      type: "status_changed",
      fromStatus: from,
      toStatus: input.to,
      note: input.note,
      actorId: input.actorId,
      occurredAt: now,
    });
  });
}

/** The only way to change an invoice's status. Checks the rules and writes the timeline event. */
export async function transitionInvoice(db: Db, input: TransitionInput<InvoiceStatus>): Promise<void> {
  await db.transaction(async (tx) => {
    const [invoice] = await tx
      .select({ status: invoices.status, paidPaise: invoices.paidPaise, totalPaise: invoices.totalPaise })
      .from(invoices)
      .where(eq(invoices.id, input.id))
      .for("update");
    if (!invoice) throw new TransitionError("Invoice not found.");

    const check = checkInvoiceTransition(invoice.status, input.to);
    if (!check.ok) throw new TransitionError(check.reason);

    if (input.to === "cancelled" && invoice.paidPaise > 0) {
      throw new TransitionError("This invoice has payments recorded, so it can't be cancelled.");
    }
    if (input.to === "paid" && invoice.paidPaise < invoice.totalPaise) {
      throw new TransitionError("Record the full payment to mark this invoice as paid.");
    }

    await tx.update(invoices).set({ status: input.to }).where(eq(invoices.id, input.id));
    await tx.insert(events).values({
      entityType: "invoice",
      entityId: input.id,
      type: "status_changed",
      fromStatus: invoice.status,
      toStatus: input.to,
      note: input.note,
      actorId: input.actorId,
      occurredAt: await appNow(tx),
    });
  });
}
