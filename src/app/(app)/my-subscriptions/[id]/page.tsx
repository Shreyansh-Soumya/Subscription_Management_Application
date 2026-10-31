import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { InvoiceSlip } from "@/components/portal/invoice-slip";
import { Stamp, subscriptionTone } from "@/components/portal/stamp";
import { db } from "@/db";
import { formatDate, frequencyWord } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { requirePageRole } from "@/lib/permissions";
import { getPortalCustomerId, getPortalSubscription } from "@/lib/portal";
import { ManagePanel } from "./manage-panel";

export const instant = false;

export default async function SubscriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageRole(["customer"]);
  const customerId = await getPortalCustomerId(db, user.id);
  const id = z.uuid().safeParse((await params).id);
  if (!customerId || !id.success) notFound();
  const detail = await getPortalSubscription(db, customerId, id.data);
  if (!detail) notFound();

  return (
    <>
      <Link href="/my-subscriptions" className="text-sm font-semibold text-stamp underline-offset-4 hover:underline">My subscriptions</Link>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <h1 className="headline text-[38px] sm:text-[56px]">{detail.planName}</h1>
        <Stamp tone={subscriptionTone(detail.status)} className="text-[14px]">{detail.status}</Stamp>
      </div>
      <p className="num mt-2 text-[14px] text-ink-soft">
        {detail.number}. Billed every {frequencyWord(detail.frequency)} since {formatDate(detail.startDate)}
        {detail.expiryDate ? `, ending ${formatDate(detail.expiryDate)}` : ""}.
      </p>

      {detail.canChange ? (
        <ManagePanel detail={detail} />
      ) : (
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_minmax(0,440px)]">
          <div>
            <p className="max-w-xl text-[15px] text-ink-soft">
              {detail.status === "closed" ? "This subscription has ended, so it can't be changed." : detail.nextInvoice ? "You can change this subscription once it's active." : "No more invoices are coming for this subscription, so it can't be changed."}
            </p>
            <ul className="mt-4 max-w-xl border-t-[1.5px] border-ink">
              {detail.lines.map((line) => (
                <li key={line.lineId} className="flex justify-between gap-4 border-b border-rule-strong py-3">
                  <span>{line.description} × {line.quantity.toLocaleString("en-IN")}</span>
                  <span className="num">{formatMoney(line.quantity * line.unitPricePaise)}</span>
                </li>
              ))}
            </ul>
          </div>
          {detail.nextInvoice && <InvoiceSlip computation={detail.nextInvoice.computation} billingDate={detail.nextInvoice.billingDate} title="First invoice" />}
        </div>
      )}
    </>
  );
}
