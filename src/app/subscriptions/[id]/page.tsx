
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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

import { getServerSession } from "@/lib/auth-guard";
import { transitionSubscription } from "@/lib/transition";

export const instant = false;

const nextStatuses: Record<string, string[]> = {
  draft: ["quotation"],
  quotation: ["confirmed"],
  confirmed: ["active"],
  active: ["paused", "closed"],
  paused: ["active", "closed"],
  closed: [],
};

const statusStyles: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  quotation: "bg-purple-100 text-purple-700",
  confirmed: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  closed: "bg-red-100 text-red-700",
};

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
}

export default async function SubscriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession();

  if (!session) redirect("/login");
  if (session.user.role !== "admin" && session.user.role !== "staff") {
    notFound();
  }

  const { id } = await params;

  const [row] = await db
    .select({
      id: subscriptions.id,
      number: subscriptions.number,
      status: subscriptions.status,
      startDate: subscriptions.startDate,
      expiryDate: subscriptions.expiryDate,
      nextBillingDate: subscriptions.nextBillingDate,
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

    await transitionSubscription(db, {
      id,
      to: to as "quotation" | "confirmed" | "active" | "paused" | "closed",
      note: note || undefined,
      actorId: currentSession.user.id,
    });

    revalidatePath("/subscriptions");
    revalidatePath(`/subscriptions/${id}`);
    redirect(`/subscriptions/${id}`);
  }

  const allowedStatuses = nextStatuses[row.status] ?? [];

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900 md:p-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">
              Brightloop / Subscriptions / {row.number}
            </p>
            <h1 className="mt-2 text-3xl font-bold">{row.number}</h1>
            <span className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[row.status]}`}>
              {row.status.toUpperCase()}
            </span>
          </div>

          <a
            href="/subscriptions"
            className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold hover:bg-slate-50"
          >
            Back to subscriptions
          </a>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Customer details</h2>
            <p className="mt-4 font-medium">{row.customerName}</p>
            <p className="mt-1 text-sm text-slate-500">{row.customerEmail}</p>
            <p className="mt-1 text-sm text-slate-500">{row.customerPhone ?? "No phone"}</p>
            <p className="mt-1 text-sm text-slate-500">{row.customerAddress ?? "No address"}</p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Subscription details</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Plan</dt>
                <dd className="font-medium">{row.planName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Frequency</dt>
                <dd className="font-medium capitalize">{row.frequency}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Start date</dt>
                <dd>{row.startDate}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Expiry date</dt>
                <dd>{row.expiryDate ?? "No expiry"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Next billing</dt>
                <dd>{row.nextBillingDate ?? "Not scheduled"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Payment terms</dt>
                <dd>{row.paymentTermsDays} days</dd>
              </div>
            </dl>
          </section>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Subscription products</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500">
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
                    <td colSpan={4} className="py-6 text-center text-slate-500">
                      No products found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Update subscription status</h2>

          {allowedStatuses.length > 0 ? (
            <form action={updateStatus} className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  New status
                </label>
                <select
                  name="status"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm"
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
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
                />
              </div>

              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Update status
              </button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              This subscription is closed. No further status changes are allowed.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Activity timeline</h2>
          <div className="mt-6 space-y-6">
            {timeline.map((event) => (
              <div key={event.id} className="relative border-l-2 border-slate-200 pl-5">
                <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-slate-900" />
                <p className="font-semibold text-sm">
                  {event.type === "status_changed"
                    ? `Status: ${event.fromStatus ?? "Created"} → ${event.toStatus ?? ""}`
                    : event.type.replaceAll("_", " ")}
                </p>
                {event.note && (
                  <p className="mt-1 text-sm text-slate-600">{event.note}</p>
                )}
                <p className="mt-1 text-xs text-slate-400">
                  {event.occurredAt.toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Kolkata",
                  })}
                </p>
              </div>
            ))}
            {timeline.length === 0 && (
              <p className="text-sm text-slate-500">No activity recorded.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
