import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  invoices,
  invoiceLines,
  customers,
  subscriptions,
  events,
} from "@/db/schema";
import { getServerSession } from "@/lib/auth-guard";
import { transitionInvoice } from "@/lib/transition";

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
  const allowed = ["confirmed", "paid", "cancelled"];

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

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getServerSession();

  if (!session) redirect("/login");
  if (session.user.role !== "admin" && session.user.role !== "staff") {
    redirect("/subscriptions");
  }

  const { id } = await params;
  const { error } = await searchParams;

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

  const actions: { status: string; label: string; style: string }[] = [];

  if (invoice.status === "draft") {
    actions.push({
      status: "confirmed",
      label: "Confirm invoice",
      style: "bg-blue-600 hover:bg-blue-700",
    });
    actions.push({
      status: "cancelled",
      label: "Cancel invoice",
      style: "bg-red-600 hover:bg-red-700",
    });
  }

  if (invoice.status === "confirmed") {
    actions.push({
      status: "paid",
      label: "Mark as paid",
      style: "bg-green-600 hover:bg-green-700",
    });
    actions.push({
      status: "cancelled",
      label: "Cancel invoice",
      style: "bg-red-600 hover:bg-red-700",
    });
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Link
          href="/invoices"
          className="text-sm text-gray-500 hover:underline"
        >
          ← Back to invoices
        </Link>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{invoice.number}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Invoice details and billing breakdown
            </p>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium capitalize">
            {invoice.status}
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase text-gray-500">Customer</p>
          <p className="mt-1 font-semibold">{invoice.customerName}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500">Subscription</p>
          <Link
            href={`/subscriptions/${invoice.subscriptionId}`}
            className="mt-1 inline-block font-semibold text-blue-700 hover:underline"
          >
            {invoice.subscriptionNumber}
          </Link>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500">Billing period</p>
          <p className="mt-1 font-medium">
            {invoice.periodStart} – {invoice.periodEnd}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500">Issue date</p>
          <p className="mt-1 font-medium">{invoice.issueDate}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500">Due date</p>
          <p className="mt-1 font-medium">{invoice.dueDate}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b p-5">
          <h2 className="font-semibold">Invoice items</h2>
        </div>

        {lines.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No invoice lines found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
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

      <section className="ml-auto max-w-md rounded-xl border bg-white p-5">
        <h2 className="mb-4 font-semibold">Amount summary</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Subtotal</span>
            <span>{money(invoice.subtotalPaise)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Discount</span>
            <span>− {money(invoice.discountPaise)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Tax</span>
            <span>{money(invoice.taxPaise)}</span>
          </div>
          <div className="flex justify-between border-t pt-3 text-base font-bold">
            <span>Total</span>
            <span>{money(invoice.totalPaise)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Paid</span>
            <span>{money(invoice.paidPaise)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Outstanding</span>
            <span>{money(outstanding)}</span>
          </div>
        </div>
      </section>

      {actions.length > 0 && (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Invoice actions</h2>
          <p className="mt-1 text-sm text-gray-500">
            Available actions depend on the current invoice status.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {actions.map((action) => (
              <form key={action.status} action={updateInvoiceStatus}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <input type="hidden" name="status" value={action.status} />
                <button
                  type="submit"
                  className={`rounded-lg px-4 py-2.5 text-sm font-medium text-white ${action.style}`}
                >
                  {action.label}
                </button>
              </form>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Invoice activity</h2>

        {history.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            No invoice status activity recorded yet.
          </p>
        ) : (
          <ol className="mt-4 space-y-4">
            {history.map((event) => (
              <li key={event.id} className="border-l-2 border-gray-200 pl-4">
                <p className="text-sm font-medium">
                  {event.type.replaceAll("_", " ")}
                  {event.toStatus ? ` · ${event.toStatus}` : ""}
                </p>
                {event.note && (
                  <p className="mt-1 text-sm text-gray-500">{event.note}</p>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  {event.occurredAt.toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
