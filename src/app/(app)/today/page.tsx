import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, asc, count, eq, gte, inArray, isNotNull, lt, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { RecordPaymentButton } from "@/app/invoices/_components/record-payment-button";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { customers, invoices, plans, subscriptions } from "@/db/schema";
import { countDueSubscriptions } from "@/lib/billing";
import { appToday } from "@/lib/clock";
import { addDays } from "@/lib/dates";
import { countOf, formatDate } from "@/lib/format";
import { renewSubscription } from "@/lib/lifecycle";
import { formatMoney } from "@/lib/money";
import { getCurrentUser, requirePageRole } from "@/lib/permissions";
import { TransitionError, transitionInvoice } from "@/lib/transition";

export const instant = false;

const ROWS_SHOWN = 15;
const RENEWAL_WINDOW_DAYS = 30;
const QUOTE_WINDOW_DAYS = 7;

async function act(formData: FormData, run: (id: string, actorId: string) => Promise<unknown>) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "staff")) redirect("/");
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) redirect("/today");
  try {
    await run(id.data, user.id);
  } catch (error) {
    if (!(error instanceof TransitionError)) throw error;
    redirect(`/today?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/today");
  redirect("/today");
}

async function confirmInvoice(formData: FormData) {
  "use server";
  await act(formData, (id, actorId) => transitionInvoice(db, { id, to: "confirmed", actorId }));
}

async function renew(formData: FormData) {
  "use server";
  await act(formData, (id, actorId) => renewSubscription(db, { id, actorId }));
}

function Queue({ id, title, total, empty, children }: { id: string; title: string; total: number; empty: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="flex items-baseline gap-3 text-lg font-semibold">
        {title}
        <span className="num text-sm font-normal text-ink-soft">{total.toLocaleString("en-IN")}</span>
      </h2>
      {total === 0 ? (
        <p className="mt-2 border-t-[1.5px] border-ink pt-3 text-sm text-ink-soft">{empty}</p>
      ) : (
        <ul className="mt-2 border-t-[1.5px] border-ink">{children}</ul>
      )}
      {total > ROWS_SHOWN && <p className="mt-2 text-sm text-ink-soft">Showing the first {ROWS_SHOWN}.</p>}
    </section>
  );
}

function Row({ href, number, who, detail, children }: { href: string; number: string; who: string; detail: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule-strong py-3">
      <span className="min-w-0">
        <Link href={href} className="num font-semibold text-stamp underline-offset-4 hover:underline">{number}</Link>
        <span className="block text-[13px] text-ink-soft">{who}. {detail}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">{children}</span>
    </li>
  );
}

function ActionForm({ id, action, label }: { id: string; action: (formData: FormData) => Promise<void>; label: string }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="outline">{label}</Button>
    </form>
  );
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requirePageRole(["admin", "staff"]);
  const { error } = await searchParams;
  const today = await appToday(db);

  const invoiceRows = (where: SQL | undefined, order: SQL) =>
    db
      .select({
        id: invoices.id,
        number: invoices.number,
        totalPaise: invoices.totalPaise,
        paidPaise: invoices.paidPaise,
        dueDate: invoices.dueDate,
        customer: customers.name,
      })
      .from(invoices)
      .innerJoin(customers, eq(invoices.customerId, customers.id))
      .where(where)
      .orderBy(order)
      .limit(ROWS_SHOWN);
  const countInvoices = async (where: SQL | undefined) => (await db.select({ total: count() }).from(invoices).where(where))[0].total;

  const toConfirm = eq(invoices.status, "draft");
  const overdue = and(eq(invoices.status, "confirmed"), lt(invoices.dueDate, today), sql`${invoices.paidPaise} < ${invoices.totalPaise}`);
  const renewing = and(
    inArray(subscriptions.status, ["active", "paused"]),
    isNotNull(subscriptions.expiryDate),
    lte(subscriptions.expiryDate, addDays(today, RENEWAL_WINDOW_DAYS)),
    eq(plans.canRenew, true),
  );
  const expiringQuotes = and(
    eq(subscriptions.status, "quotation"),
    isNotNull(subscriptions.quoteValidUntil),
    gte(subscriptions.quoteValidUntil, today),
    lte(subscriptions.quoteValidUntil, addDays(today, QUOTE_WINDOW_DAYS)),
  );

  const subscriptionRows = (where: SQL | undefined, order: SQL) =>
    db
      .select({
        id: subscriptions.id,
        number: subscriptions.number,
        expiryDate: subscriptions.expiryDate,
        quoteValidUntil: subscriptions.quoteValidUntil,
        customer: customers.name,
      })
      .from(subscriptions)
      .innerJoin(customers, eq(subscriptions.customerId, customers.id))
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(where)
      .orderBy(order)
      .limit(ROWS_SHOWN);
  const countSubscriptions = async (where: SQL | undefined) =>
    (await db.select({ total: count() }).from(subscriptions).innerJoin(plans, eq(subscriptions.planId, plans.id)).where(where))[0].total;

  const [due, confirmRows, confirmTotal, overdueRows, overdueTotal, renewalRows, renewalTotal, quoteRows, quoteTotal] = await Promise.all([
    countDueSubscriptions(db, today),
    invoiceRows(toConfirm, asc(invoices.dueDate)),
    countInvoices(toConfirm),
    invoiceRows(overdue, asc(invoices.dueDate)),
    countInvoices(overdue),
    subscriptionRows(renewing, asc(subscriptions.expiryDate)),
    countSubscriptions(renewing),
    subscriptionRows(expiringQuotes, asc(subscriptions.quoteValidUntil)),
    countSubscriptions(expiringQuotes),
  ]);

  return (
    <>
      <PageHeader title="Today" description={`What needs doing on ${formatDate(today)}. Finishing an item removes it from the list.`}>
        {due > 0 && <Button asChild variant="stamp"><Link href="/billing">Bill {countOf(due, "subscription")}</Link></Button>}
      </PageHeader>
      {error && <p role="alert" className="mt-4 max-w-xl border border-stamp-red p-3 text-sm text-stamp-red">{error}</p>}

      <div className="mt-8 grid gap-10 xl:grid-cols-2">
        <Queue id="overdue-title" title="Overdue invoices" total={overdueTotal} empty="Nothing is overdue.">
          {overdueRows.map((row) => (
            <Row key={row.id} href={`/invoices/${row.id}`} number={row.number} who={row.customer} detail={`${formatMoney(row.totalPaise - row.paidPaise)} was due ${formatDate(row.dueDate)}`}>
              <RecordPaymentButton today={today} invoiceNumber={row.number} />
            </Row>
          ))}
        </Queue>

        <Queue id="confirm-title" title="Invoices to confirm" total={confirmTotal} empty="No invoices are waiting.">
          {confirmRows.map((row) => (
            <Row key={row.id} href={`/invoices/${row.id}`} number={row.number} who={row.customer} detail={formatMoney(row.totalPaise)}>
              <ActionForm id={row.id} action={confirmInvoice} label="Confirm" />
            </Row>
          ))}
        </Queue>

        <Queue id="renewal-title" title="Upcoming renewals" total={renewalTotal} empty={`Nothing ends in the next ${RENEWAL_WINDOW_DAYS} days.`}>
          {renewalRows.map((row) => (
            <Row key={row.id} href={`/subscriptions/${row.id}`} number={row.number} who={row.customer} detail={`Ends ${formatDate(row.expiryDate!)}`}>
              <ActionForm id={row.id} action={renew} label="Renew" />
            </Row>
          ))}
        </Queue>

        <Queue id="quote-title" title="Expiring quotes" total={quoteTotal} empty={`No quotes expire in the next ${QUOTE_WINDOW_DAYS} days.`}>
          {quoteRows.map((row) => (
            <Row key={row.id} href={`/subscriptions/${row.id}`} number={row.number} who={row.customer} detail={`Valid until ${formatDate(row.quoteValidUntil!)}`}>
              <Button asChild size="sm" variant="outline"><Link href={`/subscriptions/${row.id}`}>Open</Link></Button>
            </Row>
          ))}
        </Queue>
      </div>
    </>
  );
}
