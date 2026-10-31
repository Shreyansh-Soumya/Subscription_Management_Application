import Link from "next/link";
import { RecordPaymentButton } from "@/app/invoices/_components/record-payment-button";
import { db } from "@/db";
import { DataTable, type TableColumn } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appToday } from "@/lib/clock";
import { daysBetween } from "@/lib/dates";
import {
  invoiceSummary,
  listInvoices,
  type InvoiceListItem,
  type InvoiceView,
} from "@/lib/invoice-queries";
import { formatMoney } from "@/lib/money";
import { requirePageRole } from "@/lib/permissions";
import { INVOICE_VIEWS, parseInvoiceView, parsePageNumber, parseSearchQuery } from "../_shared/params";

export const instant = false;

type SearchParams = { view?: string | string[]; q?: string | string[]; page?: string | string[] };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function href(view: InvoiceView, q: string | undefined, page?: number): string {
  const search = new URLSearchParams({ view });
  if (q) search.set("q", q);
  if (page && page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `/invoices?${query}` : "/invoices";
}

function SummaryCard({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <div className="border-[1.5px] border-ink bg-sheet p-4 shadow-[3px_3px_0_var(--ink)]">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">{label}</p>
      <p className="num mt-2 font-mono text-[20px] font-semibold leading-none">{value}</p>
      <p className="num mt-1.5 font-mono text-[10px] text-ink-soft">{meta}</p>
    </div>
  );
}

const money = (paise: number, emphasis = false) => (
  <span className={`num font-mono text-[13px] ${emphasis ? "font-semibold" : "font-medium"}`}>
    {formatMoney(paise)}
  </span>
);

function buildColumns(view: InvoiceView, today: string): TableColumn<InvoiceListItem>[] {
  const columns: TableColumn<InvoiceListItem>[] = [
    {
      key: "number",
      header: "No.",
      cell: (row) => <Link href={`/invoices/${row.invoiceId}`} className="num font-mono text-[13px] font-semibold text-stamp underline-offset-4 hover:underline">{row.number}</Link>,
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
      key: "due",
      header: "Due",
      cell: (row) => (
        <span className="grid leading-tight">
          <span className="num font-mono text-[13px]">{row.dueDate}</span>
          {view === "overdue" ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-stamp-red">
              Overdue {daysBetween(row.dueDate, today)}d
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      cell: (row) => money(row.totalPaise),
    },
    {
      key: "paid",
      header: "Paid",
      align: "right",
      cell: (row) => money(row.paidPaise),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      cell: (row) => money(row.balancePaise, true),
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      cell: (row) => <StatusBadge status={row.status} />,
    },
  ];
  // Payment actions belong on every unpaid invoice — outstanding and overdue.
  if (view !== "paid") {
    columns.push({
      key: "action",
      header: "Action",
      align: "right",
      cell: (row) => <RecordPaymentButton today={today} invoiceNumber={row.number} />,
    });
  }
  return columns;
}

const EMPTY_STATES: Record<InvoiceView, React.ReactNode> = {
  outstanding: (
    <EmptyState
      title="Nothing outstanding"
      description="Invoices appear here once they are issued and awaiting payment."
    />
  ),
  overdue: (
    <EmptyState
      title="No overdue invoices"
      description="Every issued invoice is still inside its due date."
      note="all caught up"
    />
  ),
  paid: <EmptyState title="No paid invoices yet" description="Invoices move here once their full payment is recorded." />,
};

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageRole(["admin", "staff"]);
  const params = await searchParams;
  const view = parseInvoiceView(first(params.view));
  const q = parseSearchQuery(first(params.q));
  const page = parsePageNumber(first(params.page));

  const [summary, list, today] = await Promise.all([
    invoiceSummary(db),
    listInvoices(db, { view, q, page }),
    appToday(db),
  ]);

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Issued invoices, open receivables and overdue collection in one register."
      />

      <section aria-label="Receivables summary" className="mt-6 grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Receivables"
          value={formatMoney(summary.receivablesPaise)}
          meta={`${summary.receivablesCount} open · outstanding + overdue`}
        />
        <SummaryCard
          label="Overdue"
          value={formatMoney(summary.overduePaise)}
          meta={`${summary.overdueCount} past due`}
        />
        <SummaryCard label="Paid invoices" value={String(summary.paidCount)} meta="settled in full" />
      </section>

      <nav aria-label="Invoice views" className="mt-6 inline-flex border-[1.5px] border-ink bg-sheet">
        {INVOICE_VIEWS.map((option) => (
          <Link
            key={option}
            href={href(option, q)}
            aria-current={option === view ? "page" : undefined}
            className={`flex h-10 items-center px-5 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] transition-colors ${
              option === view ? "bg-ink text-sheet" : "text-ink-soft hover:text-ink"
            }`}
          >
            {option}
          </Link>
        ))}
      </nav>

      <form action="/invoices" method="get" className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input type="hidden" name="view" value={view} />
        <Input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search invoice number, customer, email"
          className="h-10 sm:max-w-sm"
          aria-label="Search invoices"
        />
        <Button type="submit" variant="outline-paper">
          Search
        </Button>
      </form>

      <div className="mt-4">
        <DataTable
          columns={buildColumns(view, today)}
          rows={list.rows}
          rowKey={(row) => row.invoiceId}
          emptyState={EMPTY_STATES[view]}
        />
      </div>

      {list.pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-between">
          {list.page > 1 ? (
            <Button asChild variant="outline-paper" size="sm">
              <Link href={href(view, q, list.page - 1)}>Previous</Link>
            </Button>
          ) : (
            <span />
          )}
          <p className="num font-mono text-[11px] text-ink-soft">
            Page {list.page} of {list.pageCount} · {list.total} invoices
          </p>
          {list.page < list.pageCount ? (
            <Button asChild variant="outline-paper" size="sm">
              <Link href={href(view, q, list.page + 1)}>Next</Link>
            </Button>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  );
}
