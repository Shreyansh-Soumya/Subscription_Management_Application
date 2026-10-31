import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { InvoiceSlip } from "@/components/portal/invoice-slip";
import { Stamp, subscriptionTone } from "@/components/portal/stamp";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { countOf, formatDate, frequencyWord } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { requirePageRole } from "@/lib/permissions";
import { getPortalCustomerId, getPortalOverview } from "@/lib/portal";

export const instant = false;

export default async function PortalPage() {
  const user = await requirePageRole(["customer"]);
  const customerId = await getPortalCustomerId(db, user.id);
  if (!customerId) notFound();
  const overview = await getPortalOverview(db, customerId);
  const { owedPaise, overduePaise, overdueCount, nextInvoice, subscriptions } = overview;
  const running = subscriptions.filter((row) => row.status === "active").length;

  const headline =
    overduePaise > 0 ? `${formatMoney(overduePaise)} is overdue.` : owedPaise > 0 ? `You owe ${formatMoney(owedPaise)}.` : "You're all paid up.";

  return (
    <div className="grid gap-12">
      <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_minmax(0,440px)]">
        <div className="min-w-0">
          <p className="text-[15px] text-ink-soft">{user.name}</p>
          <h1 className="headline mt-3 text-[46px] text-balance break-words sm:text-[72px]">{headline}</h1>
          {nextInvoice && (
            <p className="hand mt-4 -rotate-1 text-[21px] leading-snug text-stamp">
              {nextInvoice.billingDate >= overview.today ? `next one lands on ${formatDate(nextInvoice.billingDate)}` : "your next invoice is on its way"}
            </p>
          )}
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/my-invoices" className={buttonVariants({ size: "lg" })}>
              {owedPaise > 0 ? "See what's due" : "See invoices"}
            </Link>
            <Link href="/my-subscriptions" className={buttonVariants({ size: "lg", variant: "outline" })}>
              Change seats or add-ons
            </Link>
          </div>
          <dl className="mt-10 grid max-w-xl grid-cols-3 gap-3 border-t-[1.5px] border-ink pt-3">
            <div>
              <dt className="text-[13px] text-ink-soft">Total owed</dt>
              <dd className="num mt-1 font-semibold break-words">{formatMoney(owedPaise)}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-ink-soft">Overdue</dt>
              <dd className={`mt-1 font-semibold ${overdueCount > 0 ? "text-stamp-red" : ""}`}>{countOf(overdueCount, "invoice")}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-ink-soft">Running</dt>
              <dd className="mt-1 font-semibold">{countOf(running, "subscription")}</dd>
            </div>
          </dl>
        </div>
        {nextInvoice && <InvoiceSlip computation={nextInvoice.computation} billingDate={nextInvoice.billingDate} />}
      </div>

      <section aria-labelledby="subscriptions-title">
        <h2 id="subscriptions-title" className="headline text-[30px]">Your subscriptions</h2>
        {subscriptions.length === 0 ? (
          <EmptyState className="mt-4" title="No subscriptions yet" description="Your subscriptions appear here once the Brightloop team sets them up for you." />
        ) : (
          <ul className="mt-3 border-t-[1.5px] border-ink">
            {subscriptions.slice(0, 5).map((row) => (
              <li key={row.id} className="border-b border-rule-strong">
                <Link href={`/my-subscriptions/${row.id}`} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3.5 hover:bg-paper-deep">
                  <span className="min-w-0">
                    <span className="block font-semibold">{row.planName}</span>
                    <span className="num block text-[13px] text-ink-soft">{row.number}</span>
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="num text-[14px]">{formatMoney(row.amountPaise)} per {frequencyWord(row.frequency)}, before tax</span>
                    <Stamp tone={subscriptionTone(row.status)}>{row.status}</Stamp>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
