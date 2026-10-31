import Link from "next/link";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { DataTable, type TableColumn } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { formatDate } from "@/lib/format";
import { customers, plans, subscriptions } from "@/db/schema";
import { requirePageRole } from "@/lib/permissions";

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
  page?: string | string[];
};

const PAGE_SIZE = 50;

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePageRole(["admin", "staff"]);
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

  const [{ matching }] = await db
    .select({ matching: count() })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(whereClause);
  const pageCount = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const requestedPage = Number.parseInt(String(params.page ?? "1"), 10);
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 ? Math.min(requestedPage, pageCount) : 1;

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
    .orderBy(desc(subscriptions.createdAt), desc(subscriptions.number))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

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

  const columns: TableColumn<(typeof rows)[number]>[] = [
    {
      key: "number",
      header: "Subscription",
      cell: (row) => (
        <Link href={`/subscriptions/${row.id}`} className="num font-mono text-[13px] font-semibold text-stamp underline-offset-4 hover:underline">
          {row.number}
        </Link>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (row) => (
        <>
          <span className="block font-medium">{row.customerName}</span>
          <span className="block text-xs text-ink-soft">{row.customerEmail}</span>
        </>
      ),
    },
    {
      key: "plan",
      header: "Plan",
      cell: (row) => (
        <>
          <span className="block font-medium">{row.planName}</span>
          <span className="block text-xs capitalize text-ink-soft">{row.frequency}</span>
        </>
      ),
    },
    { key: "start", header: "Start date", cell: (row) => <span className="num whitespace-nowrap">{formatDate(row.startDate)}</span> },
    {
      key: "next",
      header: "Next billing",
      cell: (row) => <span className="num whitespace-nowrap">{row.nextBillingDate ? formatDate(row.nextBillingDate) : "Not scheduled"}</span>,
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
  ];

  const pageHref = (target: number) => {
    const query = new URLSearchParams();
    if (search) query.set("q", search);
    if (status !== "all") query.set("status", status);
    if (target > 1) query.set("page", String(target));
    const text = query.toString();
    return text ? `/subscriptions?${text}` : "/subscriptions";
  };

  return (
    <>
      <PageHeader title="Subscriptions" description="Search and open every customer subscription.">
        <Button asChild variant="outline"><Link href="/quote-templates">Quote templates</Link></Button>
        <Button asChild variant="stamp"><Link href="/subscriptions/new">New subscription</Link></Button>
      </PageHeader>

      <dl className="mt-6 grid max-w-3xl grid-cols-2 gap-3 border-t-[1.5px] border-ink pt-3 sm:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label}>
            <dt className="text-[13px] text-ink-soft">{card.label}</dt>
            <dd className="headline num mt-1 text-[30px]">{card.value.toLocaleString("en-IN")}</dd>
          </div>
        ))}
      </dl>

      <form action="/subscriptions" method="GET" className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Input type="search" name="q" defaultValue={search} aria-label="Search subscriptions" placeholder="Number, customer, email or plan" className="min-w-0 flex-1" />
        <select name="status" defaultValue={status} aria-label="Status" className="h-9 border border-input bg-transparent px-2 text-sm">
          <option value="all">All statuses</option>
          {statuses.map((item) => (
            <option key={item} value={item}>{formatStatus(item)}</option>
          ))}
        </select>
        <Button type="submit">Apply filters</Button>
        <Button asChild variant="outline"><Link href="/subscriptions">Reset</Link></Button>
      </form>

      <DataTable
        className="mt-4"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        emptyState={<EmptyState className="border-0 bg-transparent" title="No subscriptions found" description="Try a different search or status." />}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-soft">
        <span>Showing {rows.length.toLocaleString("en-IN")} of {matching.toLocaleString("en-IN")}</span>
        {pageCount > 1 && (
          <span className="flex items-center gap-2">
            {page > 1 && <Button asChild size="sm" variant="outline"><Link href={pageHref(page - 1)}>Previous</Link></Button>}
            <span>Page {page} of {pageCount.toLocaleString("en-IN")}</span>
            {page < pageCount && <Button asChild size="sm" variant="outline"><Link href={pageHref(page + 1)}>Next</Link></Button>}
          </span>
        )}
      </div>
    </>
  );
}
