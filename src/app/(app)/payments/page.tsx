import Link from "next/link";
import { RecordPaymentAction } from "@/app/payments/_components/record-payment-action";
import { db } from "@/db";
import { DataTable, type TableColumn } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appToday } from "@/lib/clock";
import { listPayments, type PaymentLedgerItem } from "@/lib/invoice-queries";
import { formatMoney } from "@/lib/money";
import { requirePageRole } from "@/lib/permissions";
import { parsePageNumber, parseSearchQuery } from "../_shared/params";

export const instant = false;

type SearchParams = { q?: string | string[]; page?: string | string[] };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function href(q: string | undefined, page?: number): string {
  const search = new URLSearchParams();
  if (q) search.set("q", q);
  if (page && page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `/payments?${query}` : "/payments";
}

const columns: TableColumn<PaymentLedgerItem>[] = [
  {
    key: "paidOn",
    header: "Date",
    cell: (row) => <span className="num font-mono text-[13px]">{row.paidOn}</span>,
  },
  {
    key: "invoice",
    header: "Invoice",
    cell: (row) => <span className="num font-mono text-[13px] font-semibold">{row.invoiceNumber}</span>,
  },
  {
    key: "customer",
    header: "Customer",
    cell: (row) => <span className="truncate text-[13px] font-semibold">{row.customerName}</span>,
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
    cell: (row) => <span className="num font-mono text-[13px] font-semibold">{formatMoney(row.amountPaise)}</span>,
  },
  {
    key: "note",
    header: "Note",
    cell: (row) => (
      <span className="block max-w-[240px] truncate text-[12px] text-ink-soft">{row.note ?? "—"}</span>
    ),
  },
];

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageRole(["admin", "staff"]);
  const params = await searchParams;
  const q = parseSearchQuery(first(params.q));
  const page = parsePageNumber(first(params.page));

  const [list, today] = await Promise.all([listPayments(db, { q, page }), appToday(db)]);

  return (
    <div>
      <PageHeader title="Payments" description="The payment ledger — every rupee received against an invoice.">
        <RecordPaymentAction today={today} />
      </PageHeader>

      <form action="/payments" method="get" className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search invoice number, customer, email"
          className="h-10 sm:max-w-sm"
          aria-label="Search payments"
        />
        <Button type="submit" variant="outline-paper">
          Search
        </Button>
      </form>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={list.rows}
          rowKey={(row) => row.paymentId}
          emptyState={
            <EmptyState
              title="No payments recorded"
              description="Payments appear here as invoices are settled."
              note="every rupee, accounted for"
            />
          }
        />
      </div>

      {list.pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-between">
          {list.page > 1 ? (
            <Button asChild variant="outline-paper" size="sm">
              <Link href={href(q, list.page - 1)}>Previous</Link>
            </Button>
          ) : (
            <span />
          )}
          <p className="num font-mono text-[11px] text-ink-soft">
            Page {list.page} of {list.pageCount} · {list.total} payments
          </p>
          {list.page < list.pageCount ? (
            <Button asChild variant="outline-paper" size="sm">
              <Link href={href(q, list.page + 1)}>Next</Link>
            </Button>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  );
}
