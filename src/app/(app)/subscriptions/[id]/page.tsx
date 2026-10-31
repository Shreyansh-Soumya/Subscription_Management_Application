
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { StatusBadge } from "@/components/app/status-badge";
import { db } from "@/db";
import {
  customers,
  events,
  plans,
  productVariants,
  products,
  subscriptionLines,
  subscriptions,
} from "@/db/schema";

import { getServerSession } from "@/lib/permissions";
import { TransitionError, transitionSubscription } from "@/lib/transition";
import { z } from "zod";

export const instant = false;

const nextStatuses: Record<string, string[]> = {
  draft: ["quotation"],
  quotation: ["confirmed"],
  confirmed: ["active"],
  active: ["paused", "closed"],
  paused: ["active", "closed"],
  closed: [],
};

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
}

export default async function SubscriptionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getServerSession();

  if (!session) redirect("/login");
  if (session.user.role !== "admin" && session.user.role !== "staff") {
    notFound();
  }

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { error: statusError } = await searchParams;

  const [row] = await db
    .select({
      id: subscriptions.id,
      number: subscriptions.number,
      status: subscriptions.status,
      startDate: subscriptions.startDate,
      expiryDate: subscriptions.expiryDate,
      nextBillingDate: subscriptions.nextBillingDate,
      quoteValidUntil: subscriptions.quoteValidUntil,
      paymentTermsDays: subscriptions.paymentTermsDays,
      customerName: customers.name,
      customerEmail: customers.email,
      customerPhone: customers.phone,
      customerAddress: customers.address,
      planName: plans.name,
      frequency: plans.frequency,
      canPause: plans.canPause,
      canCloseEarly: plans.canCloseEarly,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.id, id))
    .limit(1);

  if (!row) notFound();

  const lines = await db
    .select({
      id: subscriptionLines.id,
      description: subscriptionLines.description,
      quantity: subscriptionLines.quantity,
      unitPricePaise: subscriptionLines.unitPricePaise,
      productName: products.name,
      variantAttribute: productVariants.attribute,
      variantValue: productVariants.value,
    })
    .from(subscriptionLines)
    .innerJoin(products, eq(subscriptionLines.productId, products.id))
    .leftJoin(
      productVariants,
      eq(subscriptionLines.variantId, productVariants.id),
    )
    .where(eq(subscriptionLines.subscriptionId, id));

  const timeline = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.entityType, "subscription"),
        eq(events.entityId, id),
      ),
    )
    .orderBy(desc(events.occurredAt));

  async function updateStatus(formData: FormData) {
    "use server";

    const currentSession = await getServerSession();

    if (
      !currentSession ||
      (currentSession.user.role !== "admin" &&
        currentSession.user.role !== "staff")
    ) {
      throw new Error("You are not authorized to update subscriptions.");
    }

    const to = String(formData.get("status") ?? "");

    if (!nextStatuses[row.status]?.includes(to)) {
      throw new Error("Invalid status transition.");
    }

    const note = String(formData.get("note") ?? "").trim();

    try {
      await transitionSubscription(db, {
        id,
        to: to as "quotation" | "confirmed" | "active" | "paused" | "closed",
        note: note || undefined,
        actorId: currentSession.user.id,
      });
    } catch (error) {
      if (!(error instanceof TransitionError)) throw error;
      redirect(`/subscriptions/${id}?error=${encodeURIComponent(error.message)}`);
    }

    revalidatePath("/subscriptions");
    revalidatePath(`/subscriptions/${id}`);
    redirect(`/subscriptions/${id}`);
  }

  const allowedStatuses = nextStatuses[row.status] ?? [];

  return (
    <div>
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-ink-soft">
              Brightloop / Subscriptions / {row.number}
            </p>
            <h1 className="headline text-[34px] sm:text-[44px]">{row.number}</h1>
            <StatusBadge status={row.status} className="mt-3" />
          </div>

          <Link
            href="/subscriptions"
            className="border border-rule-strong bg-sheet px-5 py-3 text-sm font-semibold hover:bg-paper-deep"
          >
            Back to subscriptions
          </Link>
        </header>

        {statusError && <p role="alert" className="border border-stamp-red p-3 text-sm text-stamp-red">{statusError}</p>}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="border border-rule-strong bg-sheet p-6 ">
            <h2 className="text-lg font-semibold">Customer details</h2>
            <p className="mt-4 font-medium">{row.customerName}</p>
            <p className="mt-1 text-sm text-ink-soft">{row.customerEmail}</p>
            <p className="mt-1 text-sm text-ink-soft">{row.customerPhone ?? "No phone"}</p>
            <p className="mt-1 text-sm text-ink-soft">{row.customerAddress ?? "No address"}</p>
          </section>

          <section className="border border-rule-strong bg-sheet p-6 ">
            <h2 className="text-lg font-semibold">Subscription details</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Plan</dt>
                <dd className="font-medium">{row.planName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Frequency</dt>
                <dd className="font-medium capitalize">{row.frequency}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Start date</dt>
                <dd>{row.startDate}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Expiry date</dt>
                <dd>{row.expiryDate ?? "No expiry"}</dd>
              </div>
              {row.quoteValidUntil && (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-soft">Quote valid until</dt>
                  <dd>{row.quoteValidUntil}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Next billing</dt>
                <dd>{row.nextBillingDate ?? "Not scheduled"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Payment terms</dt>
                <dd>{row.paymentTermsDays} days</dd>
              </div>
            </dl>
          </section>
        </div>

        <section className="border border-rule-strong bg-sheet p-6 ">
          <h2 className="text-lg font-semibold">Subscription products</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-ink-soft">
                <tr>
                  <th className="py-3">Product</th>
                  <th className="py-3">Quantity</th>
                  <th className="py-3">Unit price</th>
                  <th className="py-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td className="py-4 font-medium">
                      {line.description}
                    </td>
                    <td className="py-4">{line.quantity}</td>
                    <td className="py-4">{money(line.unitPricePaise)}</td>
                    <td className="py-4 text-right font-medium">
                      {money(line.unitPricePaise * line.quantity)}
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-ink-soft">
                      No products found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border border-rule-strong bg-sheet p-6 ">
          <h2 className="text-lg font-semibold">Update subscription status</h2>

          {allowedStatuses.length > 0 ? (
            <form action={updateStatus} className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  New status
                </label>
                <select
                  name="status"
                  className="w-full border border-rule-strong bg-sheet px-4 py-3 text-sm"
                >
                  {allowedStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Note (optional)
                </label>
                <input
                  name="note"
                  maxLength={500}
                  placeholder="Add a reason for this change"
                  className="w-full border border-rule-strong px-4 py-3 text-sm"
                />
              </div>

              <button
                type="submit"
                className="bg-ink px-5 py-3 text-sm font-semibold text-sheet hover:bg-ink-soft"
              >
                Update status
              </button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">
              This subscription is closed. No further status changes are allowed.
            </p>
          )}
        </section>

        <section className="border border-rule-strong bg-sheet p-6 ">
          <h2 className="text-lg font-semibold">Activity timeline</h2>
          <div className="mt-6 space-y-6">
            {timeline.map((event) => (
              <div key={event.id} className="relative border-l-2 border-rule-strong pl-5">
                <span className="absolute -left-[7px] top-1 h-3 w-3 bg-ink" />
                <p className="font-semibold text-sm">
                  {event.type === "status_changed"
                    ? `Status: ${event.fromStatus ?? "Created"} → ${event.toStatus ?? ""}`
                    : event.type.replaceAll("_", " ")}
                </p>
                {event.note && (
                  <p className="mt-1 text-sm text-ink-soft">{event.note}</p>
                )}
                <p className="mt-1 text-xs text-ink-soft">
                  {event.occurredAt.toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Kolkata",
                  })}
                </p>
              </div>
            ))}
            {timeline.length === 0 && (
              <p className="text-sm text-ink-soft">No activity recorded.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
