import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { and, eq, lte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  customers,
  invoices,
  plans,
  subscriptions,
} from "@/db/schema";
import { getServerSession } from "@/lib/auth-guard";
import { appToday } from "@/lib/clock";

export const instant = false;

type QueueItem = {
  id: string;
  number: string;
  customerName: string;
  detail: string;
  href: string;
};

function QueueSection({
  title,
  description,
  rows,
  empty,
}: {
  title: string;
  description: string;
  rows: QueueItem[];
  empty: string;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
          {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
          {empty}
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={row.href}
              className="flex flex-col gap-1 py-3 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-blue-700 hover:underline">
                  {row.number}
                </p>
                <p className="text-sm text-slate-700">{row.customerName}</p>
              </div>
              <p className="text-sm text-slate-500">{row.detail}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function TodayPage() {
  const session = await getServerSession();

  if (!session) redirect("/login");
  if (session.user.role !== "admin" && session.user.role !== "staff") {
    notFound();
  }

  const today = await appToday(db);

  const [billingRows, activationRows, expiryRows, overdueRows] =
    await Promise.all([
      db
        .select({
          id: subscriptions.id,
          number: subscriptions.number,
          customerName: customers.name,
          nextBillingDate: subscriptions.nextBillingDate,
        })
        .from(subscriptions)
        .innerJoin(customers, eq(subscriptions.customerId, customers.id))
        .where(
          and(
            eq(subscriptions.status, "active"),
            lte(subscriptions.nextBillingDate, today),
          ),
        )
        .orderBy(subscriptions.nextBillingDate),

      db
        .select({
          id: subscriptions.id,
          number: subscriptions.number,
          customerName: customers.name,
          startDate: subscriptions.startDate,
        })
        .from(subscriptions)
        .innerJoin(customers, eq(subscriptions.customerId, customers.id))
        .where(
          and(
            eq(subscriptions.status, "confirmed"),
            lte(subscriptions.startDate, today),
          ),
        )
        .orderBy(subscriptions.startDate),

      db
        .select({
          id: subscriptions.id,
          number: subscriptions.number,
          customerName: customers.name,
          expiryDate: subscriptions.expiryDate,
        })
        .from(subscriptions)
        .innerJoin(customers, eq(subscriptions.customerId, customers.id))
        .where(
          and(
            lte(subscriptions.expiryDate, today),
            sql`${subscriptions.status} IN ('active', 'paused')`,
          ),
        )
        .orderBy(subscriptions.expiryDate),

      db
        .select({
          id: invoices.id,
          number: invoices.number,
          customerName: customers.name,
          dueDate: invoices.dueDate,
          totalPaise: invoices.totalPaise,
          paidPaise: invoices.paidPaise,
        })
        .from(invoices)
        .innerJoin(customers, eq(invoices.customerId, customers.id))
        .where(
          and(
            lt(invoices.dueDate, today),
            sql`${invoices.status} <> 'cancelled'`,
            sql`${invoices.paidPaise} < ${invoices.totalPaise}`,
          ),
        )
        .orderBy(invoices.dueDate),
    ]);

  const billing: QueueItem[] = billingRows.map((row) => ({
    id: row.id,
    number: row.number,
    customerName: row.customerName,
    detail: `Billing date: ${row.nextBillingDate}`,
    href: `/subscriptions/${row.id}`,
  }));

  const activations: QueueItem[] = activationRows.map((row) => ({
    id: row.id,
    number: row.number,
    customerName: row.customerName,
    detail: `Start date: ${row.startDate}`,
    href: `/subscriptions/${row.id}`,
  }));

  const expiries: QueueItem[] = expiryRows.map((row) => ({
    id: row.id,
    number: row.number,
    customerName: row.customerName,
    detail: `Expiry date: ${row.expiryDate}`,
    href: `/subscriptions/${row.id}`,
  }));

  const overdue: QueueItem[] = overdueRows.map((row) => ({
    id: row.id,
    number: row.number,
    customerName: row.customerName,
    detail: `Due: ${row.dueDate} · Outstanding: ₹${(
      (row.totalPaise - row.paidPaise) / 100
    ).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    href: `/invoices/${row.id}`,
  }));

  const total =
    billing.length + activations.length + expiries.length + overdue.length;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-slate-500">Operations</p>
          <h1 className="text-2xl font-bold text-slate-900">Today&apos;s Queue</h1>
          <p className="mt-1 text-sm text-slate-500">
            Business date: {today}
          </p>
        </div>
        <Link
          href="/subscriptions"
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          View all subscriptions →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Billing due", value: billing.length },
          { label: "Activations", value: activations.length },
          { label: "Expiries", value: expiries.length },
          { label: "Overdue invoices", value: overdue.length },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <p className="text-sm text-slate-500">
        {total === 0
          ? "Everything is clear. No operational items need attention."
          : `${total} items need attention.`}
        {" "}This page is read-only; billing and status changes happen through their respective workflows.
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        <QueueSection
          title="Billing due"
          description="Active subscriptions awaiting invoice generation."
          rows={billing}
          empty="No subscriptions are due for billing."
        />
        <QueueSection
          title="Activation due"
          description="Confirmed subscriptions whose start date has arrived."
          rows={activations}
          empty="No pending activations."
        />
        <QueueSection
          title="Expiry attention"
          description="Active or paused subscriptions that have reached expiry."
          rows={expiries}
          empty="No subscriptions have reached their expiry date."
        />
        <QueueSection
          title="Overdue invoices"
          description="Invoices past their due date with an outstanding balance."
          rows={overdue}
          empty="No overdue invoices."
        />
      </div>
    </main>
  );
}
