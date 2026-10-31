
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSubscription } from "../actions";

type Customer = {
  id: string;
  name: string;
  email: string;
};

type Plan = {
  id: string;
  name: string;
  pricePaise: number;
  frequency: string;
  minQuantity: number;
};

type Product = {
  id: string;
  name: string;
  salesPricePaise: number;
};

type Variant = {
  id: string;
  productId: string;
  attribute: string;
  value: string;
};

type Discount = {
  id: string;
  name: string;
  kind: "percent" | "fixed";
  value: number;
};

type Props = {
  customers: Customer[];
  plans: Plan[];
  products: Product[];
  variants: Variant[];
  discounts: Discount[];
  today: string;
};

const fieldClass =
  "w-full border border-rule-strong bg-sheet px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100";

const labelClass = "mb-2 block text-sm font-medium text-ink";

function formatMoney(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export default function SubscriptionForm({
  customers,
  plans,
  products,
  variants,
  discounts,
  today,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [customerId, setCustomerId] = useState("");
  const [planId, setPlanId] = useState("");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [startDate, setStartDate] = useState(today);
  const [expiryDate, setExpiryDate] = useState("");
  const [paymentTermsDays, setPaymentTermsDays] = useState("30");
  const [discountIds, setDiscountIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedPlan = plans.find((plan) => plan.id === planId);

  const availableVariants = useMemo(
    () => variants.filter((variant) => variant.productId === productId),
    [variants, productId],
  );

  const selectedDiscounts = discounts.filter((discount) =>
    discountIds.includes(discount.id),
  );

  function toggleDiscount(id: string) {
    setDiscountIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!customerId || !planId || !productId) {
      setError("Please select a customer, plan and product.");
      return;
    }

    if (expiryDate && expiryDate < startDate) {
      setError("Expiry date cannot be before the start date.");
      return;
    }

    startTransition(async () => {
      const result = await createSubscription({
        customerId,
        planId,
        productId,
        variantId: variantId || null,
        quantity: Number(quantity),
        startDate,
        expiryDate: expiryDate || null,
        paymentTermsDays: Number(paymentTermsDays),
        discountIds,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setSuccess(`Subscription ${result.number} created successfully.`);
      router.push("/subscriptions");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Customer and plan</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Choose who this subscription belongs to.
          </p>
        </div>

        <div>
          <label className={labelClass}>Customer *</label>
          <select
            required
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            className={fieldClass}
          >
            <option value="">Select a customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} ({customer.email})
              </option>
            ))}
          </select>
          {customers.length === 0 && (
            <p className="mt-2 text-sm text-amber-700">
              No customers found. Add a customer first.
            </p>
          )}
        </div>

        <div>
          <label className={labelClass}>Subscription plan *</label>
          <select
            required
            value={planId}
            onChange={(event) => setPlanId(event.target.value)}
            className={fieldClass}
          >
            <option value="">Select a plan</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} — {formatMoney(plan.pricePaise)} / {plan.frequency}
              </option>
            ))}
          </select>

          {selectedPlan && (
            <p className="mt-2 text-sm text-ink-soft">
              Minimum quantity: {selectedPlan.minQuantity}
            </p>
          )}
        </div>
      </section>

      <section className="space-y-5 border-t border-rule-strong pt-6">
        <div>
          <h2 className="text-lg font-semibold">Subscription product</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Select the product and its quantity.
          </p>
        </div>

        <div>
          <label className={labelClass}>Product *</label>
          <select
            required
            value={productId}
            onChange={(event) => {
              setProductId(event.target.value);
              setVariantId("");
            }}
            className={fieldClass}
          >
            <option value="">Select a product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} — {formatMoney(product.salesPricePaise)}
              </option>
            ))}
          </select>
        </div>

        {availableVariants.length > 0 && (
          <div>
            <label className={labelClass}>Product variant</label>
            <select
              value={variantId}
              onChange={(event) => setVariantId(event.target.value)}
              className={fieldClass}
            >
              <option value="">No variant</option>
              {availableVariants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.attribute}: {variant.value}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelClass}>Quantity *</label>
          <input
            type="number"
            min={selectedPlan?.minQuantity ?? 1}
            max={100000}
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className={fieldClass}
          />
        </div>
      </section>

      <section className="space-y-5 border-t border-rule-strong pt-6">
        <div>
          <h2 className="text-lg font-semibold">Dates and payment terms</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Configure when the subscription begins and expires.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Start date *</label>
            <input
              type="date"
              required
              min={today}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Expiry date</label>
            <input
              type="date"
              min={startDate}
              value={expiryDate}
              onChange={(event) => setExpiryDate(event.target.value)}
              className={fieldClass}
            />
            <p className="mt-1 text-xs text-ink-soft">
              Leave blank if there is no fixed expiry date.
            </p>
          </div>

          <div>
            <label className={labelClass}>Payment terms (days)</label>
            <input
              type="number"
              min="0"
              max="365"
              required
              value={paymentTermsDays}
              onChange={(event) => setPaymentTermsDays(event.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-rule-strong pt-6">
        <div>
          <h2 className="text-lg font-semibold">Subscription discounts</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Select any currently available subscription-wide discounts.
          </p>
        </div>

        {discounts.length === 0 ? (
          <p className="bg-paper-deep p-4 text-sm text-ink-soft">
            No subscription discounts are currently available.
          </p>
        ) : (
          <div className="space-y-3">
            {discounts.map((discount) => (
              <label
                key={discount.id}
                className="flex cursor-pointer items-center gap-3 border border-rule-strong p-4 hover:bg-paper-deep"
              >
                <input
                  type="checkbox"
                  checked={discountIds.includes(discount.id)}
                  onChange={() => toggleDiscount(discount.id)}
                  className="h-4 w-4 accent-slate-900"
                />
                <span className="flex-1 text-sm font-medium">
                  {discount.name}
                </span>
                <span className="text-sm text-ink-soft">
                  {discount.kind === "percent"
                    ? `${discount.value / 100}% off`
                    : formatMoney(discount.value)}
                </span>
              </label>
            ))}
          </div>
        )}

        {selectedDiscounts.length > 0 && (
          <p className="text-xs text-ink-soft">
            {selectedDiscounts.length} discount(s) selected. Final discount
            application is determined by the billing engine.
          </p>
        )}
      </section>

      {error && (
        <div
          role="alert"
          className="border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="border border-green-200 bg-green-50 p-4 text-sm text-green-700"
        >
          {success}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-rule-strong pt-6 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => router.push("/subscriptions")}
          className="border border-rule-strong px-5 py-3 text-sm font-semibold text-ink hover:bg-paper-deep"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={
            pending ||
            customers.length === 0 ||
            plans.length === 0 ||
            products.length === 0
          }
          className="bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Creating..." : "Create subscription"}
        </button>
      </div>
    </form>
  );
}
