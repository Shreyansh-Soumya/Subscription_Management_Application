
import { redirect, notFound } from "next/navigation";
import { and, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  customers,
  discounts,
  plans,
  productVariants,
  products,
} from "@/db/schema";

import { getServerSession } from "@/lib/auth-guard";
import { appToday } from "@/lib/clock";
import SubscriptionForm from "./subscription-form";

export const instant = false;

export default async function NewSubscriptionPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  if (session.user.role !== "admin" && session.user.role !== "staff") {
    notFound();
  }

  const today = await appToday(db);

  const [customerRows, planRows, productRows, variantRows, discountRows] =
    await Promise.all([
      db
        .select({
          id: customers.id,
          name: customers.name,
          email: customers.email,
        })
        .from(customers)
        .orderBy(customers.name),

      db
        .select({
          id: plans.id,
          name: plans.name,
          pricePaise: plans.pricePaise,
          frequency: plans.frequency,
          minQuantity: plans.minQuantity,
        })
        .from(plans)
        .orderBy(plans.name),

      db
        .select({
          id: products.id,
          name: products.name,
          salesPricePaise: products.salesPricePaise,
        })
        .from(products)
        .orderBy(products.name),

      db
        .select({
          id: productVariants.id,
          productId: productVariants.productId,
          attribute: productVariants.attribute,
          value: productVariants.value,
        })
        .from(productVariants),

      db
        .select({
          id: discounts.id,
          name: discounts.name,
          kind: discounts.kind,
          value: discounts.value,
        })
        .from(discounts)
        .where(
          and(
            eq(discounts.scope, "subscription"),
            gte(discounts.endsOn, today),
            lte(discounts.startsOn, today),
          ),
        )
        .orderBy(discounts.name),
    ]);

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900 md:p-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <header>
          <p className="text-sm font-medium text-slate-500">
            Brightloop / Subscriptions / New
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            New Subscription
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Create and configure a new customer subscription.
          </p>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <SubscriptionForm
            customers={customerRows}
            plans={planRows}
            products={productRows}
            variants={variantRows}
            discounts={discountRows}
            today={today}
          />
        </section>
      </div>
    </main>
  );
}
