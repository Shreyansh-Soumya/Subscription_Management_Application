import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Stamp, subscriptionTone } from "@/components/portal/stamp";
import { db } from "@/db";
import { formatDate, frequencyWord } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { requirePageRole } from "@/lib/permissions";
import { getPortalCustomerId, listPortalSubscriptions } from "@/lib/portal";

export const instant = false;

export default async function MySubscriptionsPage() {
  const user = await requirePageRole(["customer"]);
  const customerId = await getPortalCustomerId(db, user.id);
  if (!customerId) notFound();
  const rows = await listPortalSubscriptions(db, customerId);

  return (
    <>
      <PageHeader title="My subscriptions" description="Open a subscription to change seats or add-ons, or to pause it. You see the new invoice before anything changes." />
      {rows.length === 0 ? (
        <EmptyState className="mt-6" title="No subscriptions yet" description="Your subscriptions appear here once the Brightloop team sets them up for you." />
      ) : (
        <ul className="mt-6 border-t-[1.5px] border-ink">
          {rows.map((row) => (
            <li key={row.id} className="border-b border-rule-strong">
              <Link href={`/my-subscriptions/${row.id}`} className="grid gap-x-6 gap-y-2 py-4 hover:bg-paper-deep sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <span className="min-w-0">
                  <span className="block font-semibold">{row.planName}</span>
                  <span className="num block text-[13px] text-ink-soft">{row.number}</span>
                </span>
                <span className="text-[14px] text-ink-soft">
                  <span className="num block text-ink">{formatMoney(row.amountPaise)} per {frequencyWord(row.frequency)}, before tax</span>
                  {row.status === "active" && row.nextBillingDate && !(row.expiryDate && row.nextBillingDate >= row.expiryDate) ? `Next invoice ${formatDate(row.nextBillingDate)}` : null}
                </span>
                <span><Stamp tone={subscriptionTone(row.status)}>{row.status}</Stamp></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
