import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CreditCard,
  Filter,
  ReceiptText,
  Repeat,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { db } from "@/db";
import { DataTable, type TableColumn } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appToday } from "@/lib/clock";
import {
  getFinanceDrillDown,
  getFinanceSummary,
  parseFinanceFilters,
  type FinanceFilters,
  type FinanceMetric,
  type FinanceOwedItem,
  type FinanceOverdueItem,
  type FinancePaymentItem,
  type FinanceRevenueItem,
  type FinanceSubscriptionItem,
} from "@/lib/finance-queries";
import { formatMoney } from "@/lib/money";
import { requirePageRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function buildFinanceHref(current: FinanceFilters, overrides: Partial<FinanceFilters>): string {
  const next = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (next.metric) {
    params.set("metric", next.metric);
  }
  if (next.from) params.set("from", next.from);
  if (next.to) params.set("to", next.to);
  if (next.q) params.set("q", next.q);
  if (next.paymentMethod && next.paymentMethod !== "all") {
    params.set("paymentMethod", next.paymentMethod);
  }
  if (next.invoiceStatus && next.invoiceStatus !== "all") {
    params.set("invoiceStatus", next.invoiceStatus);
  }
  if (next.subscriptionStatus && next.subscriptionStatus !== "all") {
    params.set("subscriptionStatus", next.subscriptionStatus);
  }
  if (next.page && next.page > 1) {
    params.set("page", String(next.page));
  }

  const query = params.toString();
  return query ? `/finance?${query}` : "/finance";
}

function MetricSummaryCard({
  metricKey,
  currentMetric,
  filters,
  label,
  value,
  meta,
  icon: Icon,
  variant = "default",
}: {
  metricKey: FinanceMetric;
  currentMetric: FinanceMetric;
  filters: FinanceFilters;
  label: string;
  value: string;
  meta: string;
  icon: typeof TrendingUp;
  variant?: "default" | "paid" | "due" | "stamp";
}) {
  const isSelected = currentMetric === metricKey;
  const href = buildFinanceHref(filters, { metric: metricKey, page: 1 });

  const toneClasses = {
    default: "hover:border-ink",
    paid: "hover:border-paid",
    due: "hover:border-due",
    stamp: "hover:border-stamp",
  }[variant];

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col justify-between border-[1.5px] p-4 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-stamp",
        isSelected
          ? "border-stamp bg-sheet shadow-[4px_4px_0_var(--stamp)] ring-1 ring-stamp"
          : cn("border-ink bg-sheet shadow-[3px_3px_0_var(--ink)]", toneClasses),
      )}
      aria-label={`Drill down to ${label}`}
      aria-current={isSelected ? "true" : undefined}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
            {label}
          </p>
          <Icon className={cn("size-4 shrink-0", isSelected ? "text-stamp" : "text-ink-soft")} />
        </div>
        <p className="num mt-2.5 font-mono text-[20px] font-semibold leading-tight break-words text-ink">
          {value}
        </p>
        <p className="num mt-1 font-mono text-[11px] text-ink-soft">{meta}</p>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-rule pt-2 text-[11px] font-mono">
        <span
          className={cn(
            "font-semibold uppercase tracking-wider",
            isSelected ? "text-stamp" : "text-ink-soft group-hover:text-ink",
          )}
        >
          {isSelected ? "Active Drill-down" : "View Records"}
        </span>
        <ArrowRight
          className={cn(
            "size-3.5 transition-transform group-hover:translate-x-0.5",
            isSelected ? "text-stamp" : "text-ink-soft group-hover:text-ink",
          )}
        />
      </div>
    </Link>
  );
}

export default async function FinancePage({ searchParams }: { searchParams: SearchParams }) {
  await requirePageRole(["admin", "staff"]);
  const rawParams = await searchParams;
  const filters = parseFinanceFilters(rawParams);

  const [summary, drillDown, today] = await Promise.all([
    getFinanceSummary(db, filters),
    getFinanceDrillDown(db, filters),
    appToday(db),
  ]);

  const hasActiveFilters = Boolean(
    filters.from ||
      filters.to ||
      filters.q ||
      (filters.paymentMethod && filters.paymentMethod !== "all") ||
      (filters.invoiceStatus && filters.invoiceStatus !== "all") ||
      (filters.subscriptionStatus && filters.subscriptionStatus !== "all"),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        description="Realized revenue, open receivables, subscription run rate, and reconciled cash flow."
      >
        <div className="flex items-center gap-2">
          <Button asChild variant="outline-paper" size="sm">
            <Link href="/payments">Payment Ledger</Link>
          </Button>
          <Button asChild variant="outline-paper" size="sm">
            <Link href="/invoices">Invoice Register</Link>
          </Button>
        </div>
      </PageHeader>

      {/* Financial Summary Metric Cards (Interactive Drill-downs) */}
      <section aria-label="Key Financial Metrics" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,230px),1fr))] gap-4">
        <MetricSummaryCard
          metricKey="active_subscriptions"
          currentMetric={filters.metric}
          filters={filters}
          label="Active Subscriptions"
          value={String(summary.activeSubscriptionsCount)}
          meta={`MRR ${formatMoney(summary.activeSubscriptionsMrrPaise)} · ARR ${formatMoney(summary.activeSubscriptionsArrPaise)}`}
          icon={Repeat}
          variant="stamp"
        />

        <MetricSummaryCard
          metricKey="revenue"
          currentMetric={filters.metric}
          filters={filters}
          label="Revenue"
          value={formatMoney(summary.revenuePaise)}
          meta={`${summary.revenuePaymentCount} payments received`}
          icon={TrendingUp}
          variant="paid"
        />

        <MetricSummaryCard
          metricKey="owed"
          currentMetric={filters.metric}
          filters={filters}
          label="Amount Owed"
          value={formatMoney(summary.amountOwedPaise)}
          meta={`${summary.amountOwedCount} open invoices due`}
          icon={Wallet}
          variant="due"
        />

        <MetricSummaryCard
          metricKey="payments"
          currentMetric={filters.metric}
          filters={filters}
          label="Payments"
          value={String(summary.paymentsCount)}
          meta={`Total ${formatMoney(summary.paymentsTotalPaise)} collected`}
          icon={CreditCard}
          variant="paid"
        />

        <MetricSummaryCard
          metricKey="overdue"
          currentMetric={filters.metric}
          filters={filters}
          label="Overdue Invoices"
          value={formatMoney(summary.overduePaise)}
          meta={`${summary.overdueCount} invoices past due`}
          icon={AlertTriangle}
          variant="due"
        />
      </section>

      {/* Financial Overview Context Bar */}
      <div className="grid gap-4 border-[1.5px] border-ink bg-sheet p-4 shadow-[3px_3px_0_var(--ink)] sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">Total Invoiced</p>
          <p className="num mt-1 font-mono text-[18px] font-semibold text-ink">
            {formatMoney(summary.totalInvoicedPaise)}
          </p>
          <p className="num mt-0.5 font-mono text-[10px] text-ink-soft">
            {summary.totalInvoicedCount} total billing cycles
          </p>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">Total Receivables</p>
          <p className="num mt-1 font-mono text-[18px] font-semibold text-due">
            {formatMoney(summary.amountOwedPaise + summary.overduePaise)}
          </p>
          <p className="num mt-0.5 font-mono text-[10px] text-ink-soft">
            {summary.amountOwedCount + summary.overdueCount} open invoices (due + overdue)
          </p>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">Realized Collection Rate</p>
          <p className="num mt-1 font-mono text-[18px] font-semibold text-paid">
            {summary.totalInvoicedPaise > 0
              ? `${Math.min(100, Math.round((summary.revenuePaise / summary.totalInvoicedPaise) * 100))}%`
              : "100%"}
          </p>
          <p className="num mt-0.5 font-mono text-[10px] text-ink-soft">
            cash collected vs invoiced volume
          </p>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">Annual Run Rate (ARR)</p>
          <p className="num mt-1 font-mono text-[18px] font-semibold text-stamp">
            {formatMoney(summary.activeSubscriptionsArrPaise)}
          </p>
          <p className="num mt-0.5 font-mono text-[10px] text-ink-soft">
            based on {summary.activeSubscriptionsCount} active subscriptions
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <section
        aria-label="Finance Filters"
        className="border-[1.5px] border-ink bg-sheet p-4 shadow-[3px_3px_0_var(--ink)]"
      >
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-ink-soft" />
            <h2 className="font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-ink">
              Filters & Reconciled Search
            </h2>
          </div>
          {hasActiveFilters ? (
            <Link
              href={`/finance?metric=${filters.metric}`}
              className="font-mono text-[11px] font-medium text-stamp underline hover:text-ink"
            >
              Reset all filters
            </Link>
          ) : null}
        </div>

        <form action="/finance" method="get" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <input type="hidden" name="metric" value={filters.metric} />

          <div className="sm:col-span-2">
            <label htmlFor="q" className="block font-mono text-[10px] uppercase tracking-wider text-ink-soft">
              Search
            </label>
            <Input
              id="q"
              type="search"
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Customer, email, invoice #, sub #"
              className="mt-1 h-9"
              aria-label="Search records"
            />
          </div>

          <div>
            <label htmlFor="from" className="block font-mono text-[10px] uppercase tracking-wider text-ink-soft">
              From Date
            </label>
            <Input
              id="from"
              type="date"
              name="from"
              defaultValue={filters.from ?? ""}
              className="mt-1 h-9 font-mono text-[12px]"
            />
          </div>

          <div>
            <label htmlFor="to" className="block font-mono text-[10px] uppercase tracking-wider text-ink-soft">
              To Date
            </label>
            <Input
              id="to"
              type="date"
              name="to"
              defaultValue={filters.to ?? ""}
              className="mt-1 h-9 font-mono text-[12px]"
            />
          </div>

          <div>
            <label
              htmlFor="paymentMethod"
              className="block font-mono text-[10px] uppercase tracking-wider text-ink-soft"
            >
              Payment Method
            </label>
            <select
              id="paymentMethod"
              name="paymentMethod"
              defaultValue={filters.paymentMethod ?? "all"}
              className="mt-1 flex h-9 w-full items-center justify-between border-[1.5px] border-ink bg-sheet px-2 py-1 font-mono text-[12px] outline-none focus:ring-1 focus:ring-stamp"
            >
              <option value="all">All Methods</option>
              <option value="upi">UPI</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="card">Card</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>

          <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-2">
            <Button type="submit" variant="stamp" className="h-9 flex-1">
              Apply
            </Button>
            <Button asChild variant="outline-paper" className="h-9 shrink-0">
              <Link href={`/finance?metric=${filters.metric}`}>Clear</Link>
            </Button>
          </div>
        </form>
      </section>

      {/* Drill-down Header & DataTable */}
      <section aria-label="Reconciled Drill-down Records" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-rule pb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-stamp" />
              <h2 className="font-mono text-[14px] font-semibold uppercase tracking-[0.1em] text-ink">
                {filters.metric === "active_subscriptions" && "Drill-down: Active Subscriptions"}
                {filters.metric === "revenue" && "Drill-down: Realized Revenue Payments"}
                {filters.metric === "owed" && "Drill-down: Amount Owed (Outstanding Invoices)"}
                {filters.metric === "payments" && "Drill-down: Payment Ledger Records"}
                {filters.metric === "overdue" && "Drill-down: Overdue Invoices"}
              </h2>
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-ink-soft">
              {filters.metric === "active_subscriptions" &&
                `${drillDown.page.total} subscriptions running today · MRR contribution`}
              {filters.metric === "revenue" &&
                `${drillDown.page.total} payments totaling ${formatMoney(summary.revenuePaise)} contributing to revenue`}
              {filters.metric === "owed" &&
                `${drillDown.page.total} open invoices due today or later totaling ${formatMoney(summary.amountOwedPaise)}`}
              {filters.metric === "payments" &&
                `${drillDown.page.total} payment transactions totaling ${formatMoney(summary.paymentsTotalPaise)}`}
              {filters.metric === "overdue" &&
                `${drillDown.page.total} past-due invoices totaling ${formatMoney(summary.overduePaise)}`}
            </p>
          </div>

          <p className="hand text-[15px] text-stamp">
            records directly reconcile with metric aggregate
          </p>
        </div>

        {/* Drill-Down Table */}
        {renderDrillDownTable(drillDown, today)}

        {/* Pagination */}
        {drillDown.page.pageCount > 1 ? (
          <div className="flex items-center justify-between pt-2">
            {drillDown.page.page > 1 ? (
              <Button asChild variant="outline-paper" size="sm">
                <Link href={buildFinanceHref(filters, { page: drillDown.page.page - 1 })}>
                  Previous
                </Link>
              </Button>
            ) : (
              <span />
            )}

            <p className="num font-mono text-[11px] text-ink-soft">
              Page {drillDown.page.page} of {drillDown.page.pageCount} · {drillDown.page.total} total records
            </p>

            {drillDown.page.page < drillDown.page.pageCount ? (
              <Button asChild variant="outline-paper" size="sm">
                <Link href={buildFinanceHref(filters, { page: drillDown.page.page + 1 })}>
                  Next
                </Link>
              </Button>
            ) : (
              <span />
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function renderDrillDownTable(
  drillDown: Awaited<ReturnType<typeof getFinanceDrillDown>>,
  today: string,
) {
  switch (drillDown.metric) {
    case "active_subscriptions": {
      const columns: TableColumn<FinanceSubscriptionItem>[] = [
        {
          key: "number",
          header: "Subscription #",
          cell: (row) => (
            <Link
              href={`/subscriptions/${row.subscriptionId}`}
              className="num font-mono text-[13px] font-semibold hover:underline"
            >
              {row.number}
            </Link>
          ),
        },
        {
          key: "customer",
          header: "Customer",
          cell: (row) => (
            <span className="grid leading-tight">
              <span className="truncate text-[13px] font-semibold">{row.customerName}</span>
              <span className="num truncate font-mono text-[10px] text-ink-soft">{row.customerEmail}</span>
            </span>
          ),
        },
        {
          key: "plan",
          header: "Plan & Cycle",
          cell: (row) => (
            <span className="grid leading-tight">
              <span className="text-[13px] font-medium">{row.planName}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">
                {row.frequency}
              </span>
            </span>
          ),
        },
        {
          key: "recurring",
          header: "Recurring Rate",
          align: "right",
          cell: (row) => (
            <span className="num font-mono text-[13px] font-semibold text-stamp">
              {formatMoney(row.recurringPaise)}
            </span>
          ),
        },
        {
          key: "nextBilling",
          header: "Next Billing",
          cell: (row) => (
            <span className="num font-mono text-[13px]">{row.nextBillingDate ?? "—"}</span>
          ),
        },
        {
          key: "status",
          header: "Status",
          align: "center",
          cell: (row) => <StatusBadge status={row.status} />,
        },
      ];

      return (
        <DataTable
          columns={columns}
          rows={drillDown.page.rows}
          rowKey={(row) => row.subscriptionId}
          emptyState={
            <EmptyState
              icon={Repeat}
              title="No active subscriptions found"
              description="No subscriptions match the active criteria or filter parameters."
              note="adjust filters to broaden results"
            />
          }
        />
      );
    }

    case "revenue": {
      const columns: TableColumn<FinanceRevenueItem>[] = [
        {
          key: "paidOn",
          header: "Date Paid",
          cell: (row) => <span className="num font-mono text-[13px]">{row.paidOn}</span>,
        },
        {
          key: "invoiceNumber",
          header: "Invoice #",
          cell: (row) => (
            <Link href={`/invoices/${row.invoiceId}`} className="num font-mono text-[13px] font-semibold hover:underline">
              {row.invoiceNumber}
            </Link>
          ),
        },
        {
          key: "customer",
          header: "Customer",
          cell: (row) => (
            <span className="grid leading-tight">
              <span className="truncate text-[13px] font-semibold">{row.customerName}</span>
              <span className="num truncate font-mono text-[10px] text-ink-soft">{row.customerEmail}</span>
            </span>
          ),
        },
        {
          key: "method",
          header: "Method",
          cell: (row) => (
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-soft">
              {row.method.replace("_", " ")}
            </span>
          ),
        },
        {
          key: "amount",
          header: "Revenue Collected",
          align: "right",
          cell: (row) => (
            <span className="num font-mono text-[13px] font-semibold text-paid">
              {formatMoney(row.amountPaise)}
            </span>
          ),
        },
        {
          key: "note",
          header: "Note",
          cell: (row) => (
            <span className="block max-w-[200px] truncate text-[12px] text-ink-soft">
              {row.note ?? "—"}
            </span>
          ),
        },
      ];

      return (
        <DataTable
          columns={columns}
          rows={drillDown.page.rows}
          rowKey={(row) => row.paymentId}
          emptyState={
            <EmptyState
              icon={TrendingUp}
              title="No revenue records found"
              description="No payments match the selected date or search filters."
            />
          }
        />
      );
    }

    case "owed": {
      const columns: TableColumn<FinanceOwedItem>[] = [
        {
          key: "number",
          header: "Invoice #",
          cell: (row) => (
            <Link href={`/invoices/${row.invoiceId}`} className="num font-mono text-[13px] font-semibold hover:underline">
              {row.number}
            </Link>
          ),
        },
        {
          key: "customer",
          header: "Customer",
          cell: (row) => (
            <span className="grid leading-tight">
              <span className="truncate text-[13px] font-semibold">{row.customerName}</span>
              <span className="num truncate font-mono text-[10px] text-ink-soft">{row.customerEmail}</span>
            </span>
          ),
        },
        {
          key: "issueDate",
          header: "Issued",
          cell: (row) => <span className="num font-mono text-[13px]">{row.issueDate}</span>,
        },
        {
          key: "dueDate",
          header: "Due Date",
          cell: (row) => (
            <span className="num font-mono text-[13px] font-medium text-due">{row.dueDate}</span>
          ),
        },
        {
          key: "total",
          header: "Total",
          align: "right",
          cell: (row) => (
            <span className="num font-mono text-[13px] text-ink-soft">{formatMoney(row.totalPaise)}</span>
          ),
        },
        {
          key: "paid",
          header: "Paid",
          align: "right",
          cell: (row) => (
            <span className="num font-mono text-[13px] text-ink-soft">{formatMoney(row.paidPaise)}</span>
          ),
        },
        {
          key: "balance",
          header: "Balance Owed",
          align: "right",
          cell: (row) => (
            <span className="num font-mono text-[13px] font-semibold text-due">
              {formatMoney(row.balancePaise)}
            </span>
          ),
        },
        {
          key: "status",
          header: "Status",
          align: "center",
          cell: (row) => <StatusBadge status={row.status} />,
        },
      ];

      return (
        <DataTable
          columns={columns}
          rows={drillDown.page.rows}
          rowKey={(row) => row.invoiceId}
          emptyState={
            <EmptyState
              icon={Wallet}
              title="No outstanding invoices"
              description="All confirmed invoices due today or later have been settled in full."
              note="all current dues cleared"
            />
          }
        />
      );
    }

    case "payments": {
      const columns: TableColumn<FinancePaymentItem>[] = [
        {
          key: "paidOn",
          header: "Payment Date",
          cell: (row) => <span className="num font-mono text-[13px]">{row.paidOn}</span>,
        },
        {
          key: "invoiceNumber",
          header: "Invoice #",
          cell: (row) => (
            <Link href={`/invoices/${row.invoiceId}`} className="num font-mono text-[13px] font-semibold hover:underline">
              {row.invoiceNumber}
            </Link>
          ),
        },
        {
          key: "customer",
          header: "Customer",
          cell: (row) => (
            <span className="grid leading-tight">
              <span className="truncate text-[13px] font-semibold">{row.customerName}</span>
              <span className="num truncate font-mono text-[10px] text-ink-soft">{row.customerEmail}</span>
            </span>
          ),
        },
        {
          key: "method",
          header: "Method",
          cell: (row) => (
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-soft">
              {row.method.replace("_", " ")}
            </span>
          ),
        },
        {
          key: "amount",
          header: "Amount",
          align: "right",
          cell: (row) => (
            <span className="num font-mono text-[13px] font-semibold">{formatMoney(row.amountPaise)}</span>
          ),
        },
        {
          key: "note",
          header: "Note",
          cell: (row) => (
            <span className="block max-w-[200px] truncate text-[12px] text-ink-soft">
              {row.note ?? "—"}
            </span>
          ),
        },
      ];

      return (
        <DataTable
          columns={columns}
          rows={drillDown.page.rows}
          rowKey={(row) => row.paymentId}
          emptyState={
            <EmptyState
              icon={CreditCard}
              title="No payments in ledger"
              description="No payment records match the current filters."
            />
          }
        />
      );
    }

    case "overdue": {
      const columns: TableColumn<FinanceOverdueItem>[] = [
        {
          key: "number",
          header: "Invoice #",
          cell: (row) => (
            <Link href={`/invoices/${row.invoiceId}`} className="num font-mono text-[13px] font-semibold hover:underline">
              {row.number}
            </Link>
          ),
        },
        {
          key: "customer",
          header: "Customer",
          cell: (row) => (
            <span className="grid leading-tight">
              <span className="truncate text-[13px] font-semibold">{row.customerName}</span>
              <span className="num truncate font-mono text-[10px] text-ink-soft">{row.customerEmail}</span>
            </span>
          ),
        },
        {
          key: "dueDate",
          header: "Due Date",
          cell: (row) => (
            <span className="grid leading-tight">
              <span className="num font-mono text-[13px] text-stamp-red">{row.dueDate}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-stamp-red font-semibold">
                Overdue {row.daysOverdue}d
              </span>
            </span>
          ),
        },
        {
          key: "total",
          header: "Total",
          align: "right",
          cell: (row) => (
            <span className="num font-mono text-[13px] text-ink-soft">{formatMoney(row.totalPaise)}</span>
          ),
        },
        {
          key: "paid",
          header: "Paid",
          align: "right",
          cell: (row) => (
            <span className="num font-mono text-[13px] text-ink-soft">{formatMoney(row.paidPaise)}</span>
          ),
        },
        {
          key: "balance",
          header: "Overdue Balance",
          align: "right",
          cell: (row) => (
            <span className="num font-mono text-[13px] font-semibold text-stamp-red">
              {formatMoney(row.balancePaise)}
            </span>
          ),
        },
        {
          key: "status",
          header: "Status",
          align: "center",
          cell: (row) => <StatusBadge status={row.status} />,
        },
      ];

      return (
        <DataTable
          columns={columns}
          rows={drillDown.page.rows}
          rowKey={(row) => row.invoiceId}
          emptyState={
            <EmptyState
              icon={AlertTriangle}
              title="No overdue invoices"
              description="No open invoices are past their payment due date."
              note="all accounts up to date"
            />
          }
        />
      );
    }
  }
}
