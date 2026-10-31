import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { events, invoices, payments, paymentMethodEnum } from "@/db/schema";
import { appNow } from "./clock";
import { isRealDate, toBusinessDate } from "./dates";
import { formatMoney } from "./money";
import { transitionInvoice } from "./transition";

/** Its message is safe to show to the user. */
export class PaymentError extends Error {}

export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];

export type RecordPaymentInput = {
  invoiceId: string;
  method: PaymentMethod;
  amountPaise: number;
  paidOn: string;
  note?: string;
  actorId?: string;
};

/**
 * The only way to record money received. Part payments leave the invoice confirmed with its balance
 * showing, and the final payment marks it paid. Check the caller's role before calling this.
 */
export async function recordPayment(
  db: Db,
  input: RecordPaymentInput,
): Promise<{ paymentId: string; status: "confirmed" | "paid"; balancePaise: number }> {
  const { invoiceId, method, amountPaise, paidOn, note, actorId } = input;
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new PaymentError("Enter an amount above zero.");
  if (!isRealDate(paidOn)) throw new PaymentError(`${paidOn} isn't a valid date.`);

  return db.transaction(async (tx) => {
    // The row lock makes payments on one invoice take turns, so together they can't exceed the balance.
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for("update");
    if (!invoice) throw new PaymentError("Invoice not found.");
    if (invoice.status === "draft") throw new PaymentError("Confirm this invoice before recording a payment.");
    if (invoice.status === "paid") throw new PaymentError("This invoice is already paid.");
    if (invoice.status === "cancelled") throw new PaymentError("This invoice is cancelled.");

    const balance = invoice.totalPaise - invoice.paidPaise;
    if (amountPaise > balance) {
      throw new PaymentError(`${formatMoney(amountPaise)} is more than the ${formatMoney(balance)} left to pay.`);
    }

    const now = await appNow(tx);
    if (paidOn > toBusinessDate(now)) throw new PaymentError("The payment date can't be in the future.");

    const [payment] = await tx
      .insert(payments)
      .values({ invoiceId, method, amountPaise, paidOn, note, recordedBy: actorId })
      .returning({ id: payments.id });
    await tx
      .update(invoices)
      .set({ paidPaise: sql`${invoices.paidPaise} + ${amountPaise}` })
      .where(eq(invoices.id, invoiceId));
    await tx.insert(events).values({
      entityType: "subscription",
      entityId: invoice.subscriptionId,
      type: "payment_recorded",
      note: `${formatMoney(amountPaise)} received for ${invoice.number}`,
      actorId,
      occurredAt: now,
      meta: { invoiceId, number: invoice.number, paymentId: payment.id, amountPaise, method },
    });

    const isFullyPaid = amountPaise === balance;
    if (isFullyPaid) await transitionInvoice(tx, { id: invoiceId, to: "paid", actorId });
    return {
      paymentId: payment.id,
      status: isFullyPaid ? ("paid" as const) : ("confirmed" as const),
      balancePaise: balance - amountPaise,
    };
  });
}
