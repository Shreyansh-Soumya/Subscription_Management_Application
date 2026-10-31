import { redirect, notFound } from "next/navigation";
import { getServerSession } from "@/lib/auth-guard";
import Link from "next/link";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers, plans, subscriptions } from "@/db/schema";

export const instant = false;

const statuses = [
  "draft",
  "quotation",
  "confirmed",
  "active",
  "paused",
  "closed",
] as const;

type SubscriptionStatus = (typeof statuses)[number];

type SearchParams = {
  q?: string | string[];
  status?: string | string[];
};

const statusStyles: Record<SubscriptionStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  quotation: "bg-purple-100 text-purple-700",
  confirmed: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  closed: "bg-red-100 text-red-700",
};

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Require an authenticated user.
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  // Only admins and staff can access internal subscriptions.
  if (session.user.role !== "admin" && session.user.role !== "staff") {
    notFound();
  }

  const params = await searchParams;

  const search =
    typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";

  const requestedStatus =
    typeof params.status === "string" ? params.status : "all";

  const status = statuses.includes(requestedStatus as SubscriptionStatus)
    ? (requestedStatus as SubscriptionStatus)
    : "all";

  // Build filters for the subscriptions table.
  const filters: SQL[] = [];

  if (search) {
    const pattern = `%${search}%`;
    const searchFilter = or(
      ilike(subscriptions.number, pattern),
      ilike(customers.name, pattern),
      ilike(customers.email, pattern),
      ilike(plans.name, pattern),
    );

    if (searchFilter) filters.push(searchFilter);
  }

  if (status !== "all") {
    filters.push(eq(subscriptions.status, status));
  }

  const whereClause = filters.length ? and(...filters) : undefined;

  // Fetch subscriptions with their customer and plan information.
  const rows = await db
    .select({
      id: subscriptions.id,
      number: subscriptions.number,
      status: subscriptions.status,
      startDate: subscriptions.startDate,
      expiryDate: subscriptions.expiryDate,
      nextBillingDate: subscriptions.nextBillingDate,
      customerName: customers.name,
      customerEmail: customers.email,
      planName: plans.name,
      frequency: plans.frequency,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(whereClause)
    .orderBy(desc(subscriptions.createdAt));

  // Count subscriptions by status for the summary cards.
  const statusCounts = await db
    .select({
      status: subscriptions.status,
      total: count(),
    })
    .from(subscriptions)
    .groupBy(subscriptions.status);

  const counts: Record<string, number> = {
    draft: 0,
    quotation: 0,
    confirmed: 0,
    active: 0,
    paused: 0,
    closed: 0,
  };

  for (const item of statusCounts) {
    counts[item.status] = Number(item.total);
  }

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  const summaryCards = [
    { label: "Total subscriptions", value: total },
    { label: "Active", value: counts.active },
    { label: "Draft", value: counts.draft },
    { label: "Paused", value: counts.paused },
  ];

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900 md:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium text-slate-500">
              Brightloop / Management
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              Subscriptions
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage and monitor all your customer subscriptions.
            </p>
          </div>

          <Link
            href="/subscriptions/new"
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            + New subscription
          </Link>
        </header>

        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="mt-2 text-3xl font-bold">{card.value}</p>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-semibold">All subscriptions</h2>
            <p className="mt-1 text-sm text-slate-500">
              Search by subscription number, customer, email, or plan.
            </p>

            <form
              action="/subscriptions"
              method="GET"
              className="mt-5 flex flex-col gap-3 sm:flex-row"
            >
              <input
                type="search"
                name="q"
                defaultValue={search}
                placeholder="Search subscriptions..."
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-slate-500"
              />

              <select
                name="status"
                defaultValue={status}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-slate-500"
              >
                <option value="all">All statuses</option>
                {statuses.map((item) => (
                  <option key={item} value={item}>
                    {formatStatus(item)}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Apply filters
              </button>

              <Link
                href="/subscriptions"
                className="rounded-lg border border-slate-300 px-5 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Reset
              </Link>
            </form>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">Subscription</th>
                  <th className="px-5 py-4 font-semibold">Customer</th>
                  <th className="px-5 py-4 font-semibold">Plan</th>
                  <th className="px-5 py-4 font-semibold">Start date</th>
                  <th className="px-5 py-4 font-semibold">Next billing</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {rows.map((subscription) => (
                  <tr
                    key={subscription.id}
                    className="transition hover:bg-slate-50"
                  >
                    <td className="whitespace-nowrap px-5 py-4 font-semibold">
                      <a
                        href={`/subscriptions/${subscription.id}`}
                        className="font-semibold text-blue-700 hover:underline"
                      >
                        {subscription.number}
                      </a>
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-medium">{subscription.customerName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {subscription.customerEmail}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-medium">{subscription.planName}</p>
                      <p className="mt-1 text-xs capitalize text-slate-500">
                        {subscription.frequency}
                      </p>
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                      {subscription.startDate}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                      {subscription.nextBillingDate ?? "—"}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[subscription.status]}`}
                      >
                        {formatStatus(subscription.status)}
                      </span>
                    </td>
                  </tr>
                ))}

                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-12 text-center text-slate-500"
                    >
                      <p className="font-medium text-slate-700">
                        No subscriptions found.
                      </p>
                      <p className="mt-1 text-sm">
                        Try changing your search or status filter.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
            Showing {rows.length} subscription{rows.length === 1 ? "" : "s"}
          </div>
        </section>
      </div>
    </main>
  );
}