
import { redirect, notFound } from "next/navigation";
import { and, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  customers,
  discounts,
  plans,
  productVariants,
  products,
  quotationTemplates,
} from "@/db/schema";

import { getServerSession } from "@/lib/permissions";
import { appToday } from "@/lib/clock";
import { createQuoteFromTemplate } from "../actions";
import SubscriptionForm from "./subscription-form";

export const instant = false;

async function startQuote(formData: FormData) {
  "use server";
  const result = await createQuoteFromTemplate({
    templateId: String(formData.get("templateId") ?? ""),
    customerId: String(formData.get("customerId") ?? ""),
  });
  if (!result.success) redirect(`/subscriptions/new?error=${encodeURIComponent(result.error)}`);
  redirect(`/subscriptions/${result.subscriptionId}`);
}

export default async function NewSubscriptionPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  if (session.user.role !== "admin" && session.user.role !== "staff") {
    notFound();
  }

  const { error: quoteError } = await searchParams;
  const today = await appToday(db);
  const templateRows = await db
    .select({ id: quotationTemplates.id, name: quotationTemplates.name, validityDays: quotationTemplates.validityDays })
    .from(quotationTemplates)
    .orderBy(quotationTemplates.name);

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
    <div>
      <div className="mx-auto max-w-4xl space-y-8">
        <header>
          <p className="text-sm font-medium text-ink-soft">
            Brightloop / Subscriptions / New
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            New Subscription
          </h1>

          <p className="mt-1 text-sm text-ink-soft">
            Create and configure a new customer subscription.
          </p>
        </header>

        <section className="border border-rule-strong bg-sheet p-6  md:p-8">
          {templateRows.length > 0 && (
          <section aria-labelledby="quote-title" className="mb-6 border-[1.5px] border-ink bg-sheet p-5">
            <h2 id="quote-title" className="text-lg font-semibold">Start from a template</h2>
            <p className="mt-1 text-sm text-ink-soft">The plan and products are filled in for you, and the quote expires after the template&apos;s validity period.</p>
            {quoteError && <p role="alert" className="mt-3 border border-stamp-red p-3 text-sm text-stamp-red">{quoteError}</p>}
            <form action={startQuote} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="grid gap-1.5">
                <label htmlFor="quote-template" className="text-sm font-medium">Template</label>
                <select id="quote-template" name="templateId" required defaultValue="" className="h-10 min-w-0 border border-input bg-transparent px-2 text-sm">
                  <option value="" disabled>Choose a template</option>
                  {templateRows.map((template) => <option key={template.id} value={template.id}>{template.name} ({template.validityDays} days)</option>)}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="quote-customer" className="text-sm font-medium">Customer</label>
                <select id="quote-customer" name="customerId" required defaultValue="" className="h-10 min-w-0 border border-input bg-transparent px-2 text-sm">
                  <option value="" disabled>Choose a customer</option>
                  {customerRows.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
              </div>
              <button type="submit" className="h-10 bg-ink px-5 text-sm font-semibold text-sheet hover:bg-ink-soft">Start quote</button>
            </form>
          </section>
        )}

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
    </div>
  );
}
