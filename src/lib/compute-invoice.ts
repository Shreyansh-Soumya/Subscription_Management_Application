import { allocate, percentOf } from "./money";

export type TaxInput = { id: string; name: string; rateBps: number };

export type InvoiceLineInput = {
  productId: string;
  description: string;
  quantity: number;
  unitPricePaise: number;
  taxes: TaxInput[];
};

export type DiscountRule = {
  id: string;
  name: string;
  kind: "percent" | "fixed";
  value: number; // basis points when percent, paise when fixed
  scope: "product" | "subscription";
  productIds: string[]; // used when scope is "product"
  minPurchasePaise: number;
  minQuantity: number;
  startsOn: string;
  endsOn: string;
  usageLimit: number | null;
  usageCount: number;
};

export type ComputedLine = InvoiceLineInput & {
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
};

export type InvoiceComputation = {
  lines: ComputedLine[];
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  taxes: (TaxInput & { amountPaise: number })[];
  appliedDiscounts: { id: string; name: string; amountPaise: number }[];
  skippedDiscounts: { id: string; name: string; reason: string }[];
};

function skipReason(
  discount: DiscountRule,
  on: string,
  eligible: InvoiceLineInput[],
): string | null {
  if (on < discount.startsOn) return "Not started yet";
  if (on > discount.endsOn) return "Expired";
  if (discount.usageLimit !== null && discount.usageCount >= discount.usageLimit) return "Usage limit reached";
  if (eligible.length === 0) return "No matching products";
  const purchase = eligible.reduce((sum, line) => sum + line.quantity * line.unitPricePaise, 0);
  if (purchase < discount.minPurchasePaise) return "Minimum purchase not met";
  const quantity = eligible.reduce((sum, line) => sum + line.quantity, 0);
  if (quantity < discount.minQuantity) return "Minimum quantity not met";
  return null;
}

/**
 * The only place invoice maths happens. Previews, the portal and the billing run all call this,
 * so they always agree. Discounts come off before tax; product discounts apply before subscription ones.
 * `on` is the India date the invoice is being calculated for.
 */
export function computeInvoice(input: {
  lines: InvoiceLineInput[];
  discounts: DiscountRule[];
  on: string;
}): InvoiceComputation {
  const { lines, discounts, on } = input;
  const remaining = lines.map((line) => line.quantity * line.unitPricePaise);
  const lineDiscounts = lines.map(() => 0);
  const appliedDiscounts: InvoiceComputation["appliedDiscounts"] = [];
  const skippedDiscounts: InvoiceComputation["skippedDiscounts"] = [];

  const ordered = [
    ...discounts.filter((discount) => discount.scope === "product"),
    ...discounts.filter((discount) => discount.scope === "subscription"),
  ];

  for (const discount of ordered) {
    const eligibleIndexes = lines.flatMap((line, index) =>
      discount.scope === "subscription" || discount.productIds.includes(line.productId) ? [index] : [],
    );
    const reason = skipReason(discount, on, eligibleIndexes.map((index) => lines[index]));
    if (reason) {
      skippedDiscounts.push({ id: discount.id, name: discount.name, reason });
      continue;
    }

    const weights = eligibleIndexes.map((index) => remaining[index]);
    const base = weights.reduce((sum, weight) => sum + weight, 0);
    const amount =
      discount.kind === "percent" ? percentOf(base, discount.value) : Math.min(discount.value, base);

    allocate(amount, weights).forEach((part, position) => {
      const index = eligibleIndexes[position];
      remaining[index] -= part;
      lineDiscounts[index] += part;
    });
    appliedDiscounts.push({ id: discount.id, name: discount.name, amountPaise: amount });
  }

  const taxTotals = new Map<string, TaxInput & { amountPaise: number }>();
  const computed: ComputedLine[] = lines.map((line, index) => {
    let taxPaise = 0;
    for (const tax of line.taxes) {
      const amount = percentOf(remaining[index], tax.rateBps);
      taxPaise += amount;
      const total = taxTotals.get(tax.id) ?? { ...tax, amountPaise: 0 };
      total.amountPaise += amount;
      taxTotals.set(tax.id, total);
    }
    return {
      ...line,
      subtotalPaise: line.quantity * line.unitPricePaise,
      discountPaise: lineDiscounts[index],
      taxPaise,
      totalPaise: remaining[index] + taxPaise,
    };
  });

  const sum = (pick: (line: ComputedLine) => number) => computed.reduce((total, line) => total + pick(line), 0);

  return {
    lines: computed,
    subtotalPaise: sum((line) => line.subtotalPaise),
    discountPaise: sum((line) => line.discountPaise),
    taxPaise: sum((line) => line.taxPaise),
    totalPaise: sum((line) => line.totalPaise),
    taxes: [...taxTotals.values()],
    appliedDiscounts,
    skippedDiscounts,
  };
}
