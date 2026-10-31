import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { invoiceStamp, Stamp } from "@/components/portal/stamp";
import { db } from "@/db";
import { formatDate, paymentMethodLabel } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { requirePageRole } from "@/lib/permissions";
import { getPortalCustomerId, getPortalInvoice } from "@/lib/portal";

export const instant = false;

function Row({ label, amount, tone, strong }: { label: string; amount: string; tone?: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 border-b border-rule py-2 ${strong ? "font-semibold" : ""} ${tone ?? ""}`}>
      <span className="min-w-0">{label}</span>
      <span className="num shrink-0">{amount}</span>
    </div>
  );
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageRole(["customer"]);
  const customerId = await getPortalCustomerId(db, user.id);
  const id = z.uuid().safeParse((await params).id);
  if (!customerId || !id.success) notFound();
  const invoice = await getPortalInvoice(db, customerId, id.data);
  if (!invoice) notFound();
  const stamp = invoiceStamp(invoice);

  return (
    <>
      <Link href="/my-invoices" className="text-sm font-semibold text-stamp underline-offset-4 hover:underline">My invoices</Link>

      <article className="relative mt-4 max-w-3xl border-[1.5px] border-ink bg-sheet py-7 pr-5 pl-9 shadow-[6px_6px_0_var(--ink)] before:absolute before:inset-y-0 before:left-5 before:border-l-[1.5px] before:border-margin sm:pr-8 sm:pl-12 sm:before:left-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="headline num text-[36px] sm:text-[48px]">{invoice.number}</h1>
            <p className="mt-2 text-[14px] text-ink-soft">
              For {formatDate(invoice.periodStart)} to {formatDate(invoice.periodEnd)}, on subscription {invoice.subscriptionNumber}
            </p>
          </div>
          <Stamp tone={stamp.tone} large>{stamp.label}</Stamp>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 border-t-[1.5px] border-ink pt-3 text-[14px]">
          <div><dt className="text-ink-soft">Issued</dt><dd className="mt-0.5 font-medium">{formatDate(invoice.issueDate)}</dd></div>
          <div><dt className="text-ink-soft">Due</dt><dd className={`mt-0.5 font-medium ${invoice.isOverdue ? "text-stamp-red" : ""}`}>{formatDate(invoice.dueDate)}</dd></div>
        </dl>

        <div className="mt-6 text-[15px]">
          {invoice.lines.map((line) => (
            <Row key={line.id} label={`${line.description} × ${line.quantity.toLocaleString("en-IN")}`} amount={formatMoney(line.subtotalPaise)} />
          ))}
          {invoice.appliedDiscounts.map((discount) => (
            <Row key={discount.id} label={discount.name} amount={`−${formatMoney(discount.amountPaise)}`} tone="text-paid" />
          ))}
          {invoice.taxes.map((tax) => (
            <Row key={tax.id} label={tax.name} amount={formatMoney(tax.amountPaise)} />
          ))}
          <Row label="Total" amount={formatMoney(invoice.totalPaise)} strong />
          {invoice.paidPaise > 0 && <Row label="Paid so far" amount={`−${formatMoney(invoice.paidPaise)}`} tone="text-paid" />}
        </div>

        {invoice.status === "confirmed" && (
          <div className="mt-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <span className="font-semibold">Left to pay</span>
            <strong className="headline num text-[38px] sm:text-[46px]">{formatMoney(invoice.balancePaise)}</strong>
          </div>
        )}
      </article>

      {invoice.status === "confirmed" && (
        <p className="mt-6 max-w-2xl text-[15px]">
          Paying by bank transfer? Put <strong className="num">{invoice.number}</strong> in the reference so your payment reaches this invoice.
        </p>
      )}

      {invoice.payments.length > 0 && (
        <section aria-labelledby="payments-title" className="mt-8 max-w-3xl">
          <h2 id="payments-title" className="text-lg font-semibold">Payments</h2>
          <ul className="mt-2 border-t-[1.5px] border-ink">
            {invoice.payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap justify-between gap-x-4 border-b border-rule-strong py-3 text-[15px]">
                <span>{formatDate(payment.paidOn)}, {paymentMethodLabel(payment.method)}</span>
                <span className="num font-medium">{formatMoney(payment.amountPaise)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
