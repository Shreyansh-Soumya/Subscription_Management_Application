import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { requirePageRole } from "@/lib/permissions";
import { getPortalCustomerId, listPortalPayments } from "@/lib/portal";

export const instant = false;

const METHODS: Record<string, string> = { bank_transfer: "Bank transfer", upi: "UPI", cash: "Cash", card: "Card", cheque: "Cheque" };

export default async function MyPaymentsPage() {
  const user = await requirePageRole(["customer"]);
  const customerId = await getPortalCustomerId(db, user.id);
  if (!customerId) notFound();
  const rows = await listPortalPayments(db, customerId);

  return (
    <>
      <PageHeader title="Payments" description="Every payment recorded against your invoices." />
      {rows.length === 0 ? (
        <EmptyState className="mt-6" title="No payments yet" description="Payments appear here once they're recorded against an invoice." />
      ) : (
        <ul className="mt-6 max-w-3xl border-t-[1.5px] border-ink">
          {rows.map((row) => (
            <li key={row.id} className="border-b border-rule-strong">
              <Link href={`/my-invoices/${row.invoiceId}`} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3.5 hover:bg-paper-deep">
                <span className="min-w-0">
                  <span className="num block font-medium">{row.invoiceNumber}</span>
                  <span className="block text-[13px] text-ink-soft">{formatDate(row.paidOn)}, {METHODS[row.method] ?? row.method}</span>
                </span>
                <span className="num font-semibold">{formatMoney(row.amountPaise)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
