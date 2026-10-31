import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { StatusBadge } from "@/components/app/status-badge";
import { db } from "@/db";
import {
  invoices,
  invoiceLines,
  customers,
  subscriptions,
  events,
} from "@/db/schema";
import { getServerSession } from "@/lib/permissions";
import { transitionInvoice } from "@/lib/transition";
import { z } from "zod";
import { RecordPaymentButton } from "@/app/invoices/_components/record-payment-button";
import { PrintButton } from "@/components/app/print-button";
import { appNow, appToday } from "@/lib/clock";
import type { InvoiceComputation } from "@/lib/compute-invoice";
import { sendEmail } from "@/lib/email";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const instant = false;

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

async function updateInvoiceStatus(formData: FormData) {
  "use server";

  const session = await getServerSession();

  if (!session) redirect("/login");
  if (session.user.role !== "admin" && session.user.role !== "staff") {
    redirect("/subscriptions");
  }

  const id = String(formData.get("invoiceId") ?? "");
  const to = String(formData.get("status") ?? "");
  const allowed = ["confirmed", "cancelled"]; // "paid" only comes from recording the full payment

  if (!id || !allowed.includes(to)) {
    redirect("/invoices");
  }

  try {
    await transitionInvoice(db, {
      id,
      to: to as "confirmed" | "paid" | "cancelled",
      note: `Invoice status changed to ${to}`,
      actorId: session.user.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update invoice.";
    redirect(`/invoices/${id}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/today");
  redirect(`/invoices/${id}`);
}

async function sendInvoiceEmail(formData: FormData) {
  "use server";

  const session = await getServerSession();
  if (!session) redirect("/login");
  if (session.user.role !== "admin" && session.user.role !== "staff") redirect("/");

  const id = z.uuid().safeParse(formData.get("invoiceId"));
  if (!id.success) redirect("/invoices");

  const [row] = await db
    .select({ invoice: invoices, email: customers.email, name: customers.name })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(eq(invoices.id, id.data));
  if (!row || row.invoice.status === "draft") redirect(`/invoices/${id.data}?error=${encodeURIComponent("Confirm this invoice before sending it.")}`);

  const { number, totalPaise, paidPaise, dueDate } = row.invoice;
  try {
    await sendEmail({
      to: row.email,
      subject: `Invoice ${number} from Brightloop`,
      text: `Hi ${row.name},\n\nInvoice ${number} is for ${formatMoney(totalPaise)}, with ${formatMoney(totalPaise - paidPaise)} left to pay by ${formatDate(dueDate)}.\nPut ${number} in the reference if you pay by bank transfer.\n\nSee it any time in your Brightloop account.`,
    });
  } catch (error) {
    console.error(`Sending ${number} failed`, error);
    redirect(`/invoices/${id.data}?error=${encodeURIComponent("The email couldn't be sent. Try again.")}`);
  }
  await db.insert(events).values({
    entityType: "invoice",
    entityId: id.data,
    type: "invoice_sent",
    note: `Sent to ${row.email}`,
    actorId: session.user.id,
    occurredAt: await appNow(db),
  });
  revalidatePath(`/invoices/${id.data}`);
  redirect(`/invoices/${id.data}?sent=1`);
}

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const session = await getServerSession();

  if (!session) redirect("/login");
  if (session.user.role !== "admin" && session.user.role !== "staff") {
    redirect("/subscriptions");
  }

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { error, sent } = await searchParams;
  const today = await appToday(db);

  const [invoice] = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      periodStart: invoices.periodStart,
      periodEnd: invoices.periodEnd,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      subtotalPaise: invoices.subtotalPaise,
      discountPaise: invoices.discountPaise,
      taxPaise: invoices.taxPaise,
      totalPaise: invoices.totalPaise,
      paidPaise: invoices.paidPaise,
      breakdown: invoices.breakdown,
      customerName: customers.name,
      subscriptionId: subscriptions.id,
      subscriptionNumber: subscriptions.number,
    })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .innerJoin(subscriptions, eq(invoices.subscriptionId, subscriptions.id))
    .where(eq(invoices.id, id))
    .limit(1);

  if (!invoice) notFound();

  const [lines, history] = await Promise.all([
    db
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, id)),

    db
      .select()
      .from(events)
      .where(eq(events.entityId, id))
      .orderBy(desc(events.occurredAt)),
  ]);

  const outstanding =
    invoice.status === "cancelled"
      ? 0
      : Math.max(0, invoice.totalPaise - invoice.paidPaise);

  const breakdown = (invoice.breakdown ?? {}) as Partial<InvoiceComputation>;
  const actions: { status: string; label: string; style: string }[] = [];

  if (invoice.status === "draft") {
    actions.push({
      status: "confirmed",
      label: "Confirm invoice",
      style: "bg-stamp hover:bg-ink",
    });
    actions.push({
      status: "cancelled",
      label: "Cancel invoice",
      style: "bg-stamp-red hover:bg-ink",
    });
  }

  if (invoice.status === "confirmed") {
    actions.push({
      status: "cancelled",
      label: "Cancel invoice",
      style: "bg-stamp-red hover:bg-ink",
    });
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link
          href="/invoices"
          className="text-sm text-ink-soft hover:underline"
        >
          ← Back to invoices
        </Link>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="headline text-[34px] sm:text-[44px]">{invoice.number}</h1>
            <p className="mt-1 text-sm text-ink-soft">
              Invoice details and billing breakdown
            </p>
          </div>
          <StatusBadge status={invoice.status} />
        </div>
      </div>

      {error && (
        <div className="border border-red-200 bg-sheet border border-stamp-red p-3 text-sm text-stamp-red">
          {error}
        </div>
      )}

      <section className="grid gap-4 border bg-sheet p-5 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase text-ink-soft">Customer</p>
          <p className="mt-1 font-semibold">{invoice.customerName}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-ink-soft">Subscription</p>
          <Link
            href={`/subscriptions/${invoice.subscriptionId}`}
            className="mt-1 inline-block font-semibold text-stamp hover:underline"
          >
            {invoice.subscriptionNumber}
          </Link>
        </div>
        <div>
          <p className="text-xs uppercase text-ink-soft">Billing period</p>
          <p className="mt-1 font-medium">
            {invoice.periodStart} – {invoice.periodEnd}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-ink-soft">Issue date</p>
          <p className="mt-1 font-medium">{invoice.issueDate}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-ink-soft">Due date</p>
          <p className="mt-1 font-medium">{invoice.dueDate}</p>
        </div>
      </section>

      <section className="overflow-hidden border bg-sheet">
        <div className="border-b p-5">
          <h2 className="font-semibold">Invoice items</h2>
        </div>

        {lines.length === 0 ? (
          <p className="p-6 text-sm text-ink-soft">No invoice lines found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper-deep text-xs uppercase text-ink-soft">
                <tr>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3">Quantity</th>
                  <th className="px-5 py-3">Unit price</th>
                  <th className="px-5 py-3">Discount</th>
                  <th className="px-5 py-3">Tax</th>
                  <th className="px-5 py-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-5 py-4 font-medium">
                      {line.description}
                    </td>
                    <td className="px-5 py-4">{line.quantity}</td>
                    <td className="px-5 py-4">
                      {money(line.unitPricePaise)}
                    </td>
                    <td className="px-5 py-4">
                      {money(line.discountPaise)}
                    </td>
                    <td className="px-5 py-4">{money(line.taxPaise)}</td>
                    <td className="px-5 py-4 font-medium">
                      {money(line.totalPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ml-auto max-w-md border bg-sheet p-5">
        <h2 className="mb-4 font-semibold">Amount summary</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-soft">Subtotal</span>
            <span>{money(invoice.subtotalPaise)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Discount</span>
            <span>− {money(invoice.discountPaise)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Tax</span>
            <span>{money(invoice.taxPaise)}</span>
          </div>
          <div className="flex justify-between border-t pt-3 text-base font-bold">
            <span>Total</span>
            <span>{money(invoice.totalPaise)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Paid</span>
            <span>{money(invoice.paidPaise)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Outstanding</span>
            <span>{money(outstanding)}</span>
          </div>
        </div>
      </section>

      <section aria-label="How the total was worked out" className="border bg-sheet p-5">
        <h2 className="font-semibold">How the total was worked out</h2>
        <dl className="mt-3 grid gap-2 text-sm">
          <div className="flex justify-between gap-4"><dt>Subtotal</dt><dd className="num">{money(invoice.subtotalPaise)}</dd></div>
          {(breakdown.appliedDiscounts ?? []).map((discount) => (
            <div key={discount.id} className="flex justify-between gap-4 text-paid"><dt>{discount.name}</dt><dd className="num">−{money(discount.amountPaise)}</dd></div>
          ))}
          {(breakdown.taxes ?? []).map((tax) => (
            <div key={tax.id} className="flex justify-between gap-4"><dt>{tax.name}</dt><dd className="num">{money(tax.amountPaise)}</dd></div>
          ))}
          <div className="flex justify-between gap-4 border-t border-rule-strong pt-2 font-semibold"><dt>Total</dt><dd className="num">{money(invoice.totalPaise)}</dd></div>
        </dl>
        {(breakdown.skippedDiscounts ?? []).length > 0 && (
          <ul className="mt-3 grid gap-1 text-sm text-ink-soft print:hidden">
            {(breakdown.skippedDiscounts ?? []).map((discount) => <li key={discount.id}>{discount.name} didn&apos;t apply: {discount.reason}.</li>)}
          </ul>
        )}
      </section>

      {sent && <p role="status" className="border border-paid p-3 text-sm font-medium text-paid print:hidden">Invoice sent.</p>}

      <section aria-label="Print and send" className="flex flex-wrap gap-3 print:hidden">
        <PrintButton />
        {invoice.status !== "draft" && (
          <form action={sendInvoiceEmail}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <button type="submit" className="border border-rule-strong px-4 py-2.5 text-sm font-medium hover:bg-paper-deep">Send by email</button>
          </form>
        )}
        {invoice.status === "confirmed" && <RecordPaymentButton today={today} invoiceNumber={invoice.number} />}
      </section>

      {actions.length > 0 && (
        <section className="border bg-sheet p-5 print:hidden">
          <h2 className="font-semibold">Invoice actions</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Available actions depend on the current invoice status.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {actions.map((action) => (
              <form key={action.status} action={updateInvoiceStatus}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <input type="hidden" name="status" value={action.status} />
                <button
                  type="submit"
                  className={`px-4 py-2.5 text-sm font-medium text-sheet ${action.style}`}
                >
                  {action.label}
                </button>
              </form>
            ))}
          </div>
        </section>
      )}

      <section className="border bg-sheet p-5 print:hidden">
        <h2 className="font-semibold">Invoice activity</h2>

        {history.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">
            No invoice status activity recorded yet.
          </p>
        ) : (
          <ol className="mt-4 space-y-4">
            {history.map((event) => (
              <li key={event.id} className="border-l-2 border-rule-strong pl-4">
                <p className="text-sm font-medium">
                  {event.type.replaceAll("_", " ")}
                  {event.toStatus ? ` · ${event.toStatus}` : ""}
                </p>
                {event.note && (
                  <p className="mt-1 text-sm text-ink-soft">{event.note}</p>
                )}
                <p className="mt-1 text-xs text-ink-soft">
                  {event.occurredAt.toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
