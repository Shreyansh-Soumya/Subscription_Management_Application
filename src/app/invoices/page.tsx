import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { invoices, customers, subscriptions } from "@/db/schema";
import { getServerSession } from "@/lib/auth-guard";

export const instant = false;

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

function statusStyle(status: string) {
  switch (status) {
    case "paid":
      return "bg-green-100 text-green-700";
    case "confirmed":
      return "bg-blue-100 text-blue-700";
    case "cancelled":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-amber-100 text-amber-700";
  }
}

export default async function InvoicesPage() {
  const session = await getServerSession();

  if (!session) redirect("/login");
  if (session.user.role !== "admin" && session.user.role !== "staff") {
    redirect("/subscriptions");
  }

  const rows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      totalPaise: invoices.totalPaise,
      paidPaise: invoices.paidPaise,
      customerName: customers.name,
      subscriptionNumber: subscriptions.number,
    })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .innerJoin(subscriptions, eq(invoices.subscriptionId, subscriptions.id))
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt));

  const totalOutstanding = rows
    .filter((row) => row.status !== "cancelled")
    .reduce(
      (sum, row) => sum + Math.max(0, row.totalPaise - row.paidPaise),
      0,
    );

  const totalPaid = rows.reduce((sum, row) => sum + row.paidPaise, 0);

  const counts = {
    all: rows.length,
    draft: rows.filter((row) => row.status === "draft").length,
    confirmed: rows.filter((row) => row.status === "confirmed").length,
    paid: rows.filter((row) => row.status === "paid").length,
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <Link
          href="/today"
          className="text-sm text-gray-500 hover:underline"
        >
          ← Back to Today
        </Link>
        <h1 className="mt-3 text-2xl font-bold">Invoices</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review generated invoices, their payment status and outstanding balances.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-gray-500">Total invoices</p>
          <p className="mt-2 text-2xl font-bold">{counts.all}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-gray-500">Draft</p>
          <p className="mt-2 text-2xl font-bold">{counts.draft}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-gray-500">Confirmed</p>
          <p className="mt-2 text-2xl font-bold">{counts.confirmed}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-gray-500">Outstanding</p>
          <p className="mt-2 text-2xl font-bold">{money(totalOutstanding)}</p>
          <p className="mt-1 text-xs text-gray-400">
            Recorded payments: {money(totalPaid)}
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b p-5">
          <h2 className="font-semibold">All invoices</h2>
          <p className="mt-1 text-sm text-gray-500">
            Select an invoice to view its details and available actions.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-medium">No invoices yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Invoices will appear here when the billing engine processes due subscriptions.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-5 py-3">Invoice</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Subscription</th>
                  <th className="px-5 py-3">Issue date</th>
                  <th className="px-5 py-3">Due date</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Outstanding</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((invoice) => {
                  const outstanding =
                    invoice.status === "cancelled"
                      ? 0
                      : Math.max(0, invoice.totalPaise - invoice.paidPaise);

                  return (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-5 py-4 font-medium">
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="text-blue-700 hover:underline"
                        >
                          {invoice.number}
                        </Link>
                      </td>
                      <td className="px-5 py-4">{invoice.customerName}</td>
                      <td className="px-5 py-4">{invoice.subscriptionNumber}</td>
                      <td className="px-5 py-4">{invoice.issueDate}</td>
                      <td className="px-5 py-4">{invoice.dueDate}</td>
                      <td className="px-5 py-4">{money(invoice.totalPaise)}</td>
                      <td className="px-5 py-4">{money(outstanding)}</td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle(invoice.status)}`}>
                          {invoice.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
