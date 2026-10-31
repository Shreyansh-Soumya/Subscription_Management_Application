"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQuoteTemplate } from "./actions";

type Plan = {
  id: string;
  name: string;
  frequency: string;
  pricePaise: number;
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

type Line = {
  productId: string;
  variantId: string;
  quantity: number;
};

export default function TemplateForm({
  plans,
  products,
  variants,
}: {
  plans: Plan[];
  products: Product[];
  variants: Variant[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [planId, setPlanId] = useState("");
  const [validityDays, setValidityDays] = useState(30);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { productId: "", variantId: "", quantity: 1 },
  ]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function updateLine(index: number, field: keyof Line, value: string | number) {
    setLines((current) =>
      current.map((line, i) =>
        i === index
          ? {
              ...line,
              [field]: value,
              ...(field === "productId" ? { variantId: "" } : {}),
            }
          : line,
      ),
    );
  }

  function addLine() {
    setLines((current) => [
      ...current,
      { productId: "", variantId: "", quantity: 1 },
    ]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, i) => i !== index));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    startTransition(async () => {
      const result = await createQuoteTemplate({
        name,
        planId,
        validityDays,
        notes,
        lines: lines.map((line) => ({
          productId: line.productId,
          variantId: line.variantId || null,
          quantity: line.quantity,
        })),
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setSuccess("Quote template created successfully.");
      setName("");
      setPlanId("");
      setValidityDays(30);
      setNotes("");
      setLines([{ productId: "", variantId: "", quantity: 1 }]);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Create quote template</h2>
        <p className="mt-1 text-sm text-gray-500">
          Save reusable plan and product combinations for quotations.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Template name
          <input
            required
            minLength={2}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Standard Business Package"
            className="mt-1 w-full rounded-lg border p-2.5 font-normal"
          />
        </label>

        <label className="block text-sm font-medium">
          Plan
          <select
            required
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className="mt-1 w-full rounded-lg border p-2.5 font-normal"
          >
            <option value="">Select a plan</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} ({plan.frequency})
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium">
          Quote validity (days)
          <input
            required
            type="number"
            min={1}
            max={365}
            value={validityDays}
            onChange={(e) => setValidityDays(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border p-2.5 font-normal"
          />
        </label>

        <label className="block text-sm font-medium">
          Notes
          <input
            value={notes}
            maxLength={1000}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
            className="mt-1 w-full rounded-lg border p-2.5 font-normal"
          />
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Template products</h3>
          <button
            type="button"
            onClick={addLine}
            disabled={lines.length >= 30}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            + Add product
          </button>
        </div>

        {lines.map((line, index) => {
          const availableVariants = variants.filter(
            (variant) => variant.productId === line.productId,
          );

          return (
            <div
              key={index}
              className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[2fr_1.5fr_100px_auto]"
            >
              <label className="text-sm font-medium">
                Product
                <select
                  required
                  value={line.productId}
                  onChange={(e) =>
                    updateLine(index, "productId", e.target.value)
                  }
                  className="mt-1 w-full rounded-lg border p-2 font-normal"
                >
                  <option value="">Select product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium">
                Variant
                <select
                  value={line.variantId}
                  onChange={(e) =>
                    updateLine(index, "variantId", e.target.value)
                  }
                  disabled={!line.productId || availableVariants.length === 0}
                  className="mt-1 w-full rounded-lg border p-2 font-normal"
                >
                  <option value="">No variant</option>
                  {availableVariants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.attribute}: {variant.value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium">
                Quantity
                <input
                  required
                  type="number"
                  min={1}
                  max={100000}
                  value={line.quantity}
                  onChange={(e) =>
                    updateLine(index, "quantity", Number(e.target.value))
                  }
                  className="mt-1 w-full rounded-lg border p-2 font-normal"
                />
              </label>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  disabled={lines.length === 1}
                  className="rounded-lg border px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-30"
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}

      <button
        type="submit"
        disabled={isPending || plans.length === 0 || products.length === 0}
        className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isPending ? "Creating..." : "Create quote template"}
      </button>

      {(plans.length === 0 || products.length === 0) && (
        <p className="text-sm text-amber-700">
          Add at least one plan and one product before creating a template.
        </p>
      )}
    </form>
  );
}
