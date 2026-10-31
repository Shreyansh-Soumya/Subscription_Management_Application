import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { invoiceStamp, Stamp } from "@/components/portal/stamp";
import { db } from "@/db";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { requirePageRole } from "@/lib/permissions";
import { getPortalCustomerId, listPortalInvoices } from "@/lib/portal";

export const instant = false;

export default async function MyInvoicesPage() {
  const user = await requirePageRole(["customer"]);
  const customerId = await getPortalCustomerId(db, user.id);
  if (!customerId) notFound();
  const rows = await listPortalInvoices(db, customerId);

  return (
    <>
      <PageHeader title="My invoices" description="Open an invoice to see how its total was worked out and what you've paid." />
      {rows.length === 0 ? (
        <EmptyState className="mt-6" title="No invoices yet" description="Invoices appear here once they've been issued." />
      ) : (
        <ul className="mt-6 border-t-[1.5px] border-ink">
          {rows.map((row) => {
            const stamp = invoiceStamp(row);
            return (
              <li key={row.id} className="border-b border-rule-strong">
                <Link href={`/my-invoices/${row.id}`} className="grid gap-x-6 gap-y-2 py-4 hover:bg-paper-deep sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <span className="min-w-0">
                    <span className="num block font-semibold">{row.number}</span>
                    <span className="block text-[13px] text-ink-soft">Due {formatDate(row.dueDate)}</span>
                  </span>
                  <span className="num text-[14px] sm:text-right">
                    <span className="block font-medium">{formatMoney(row.totalPaise)}</span>
                    {row.status === "confirmed" && row.balancePaise !== row.totalPaise && (
                      <span className="block text-[13px] text-ink-soft">{formatMoney(row.balancePaise)} left to pay</span>
                    )}
                  </span>
                  <span><Stamp tone={stamp.tone}>{stamp.label}</Stamp></span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
