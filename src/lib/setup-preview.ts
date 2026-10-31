import { variantUnitPricePaise } from "./catalog-validation";
import { computeInvoice, type DiscountRule, type InvoiceComputation, type TaxInput } from "./compute-invoice";

const NEW_PRODUCT = "new-product";

export type SetupPreviewInput = {
  productName: string;
  salesPricePaise: number;
  /** Blank until the admin sets a plan price. The plan then starts from the product's price. */
  planPricePaise: number | null;
  extraPricePaise: number;
  quantity: number;
  taxes: TaxInput[];
  discount: {
    name: string;
    kind: "percent" | "fixed";
    value: number;
    scope: "product" | "subscription";
    minPurchasePaise: number;
    minQuantity: number;
    startsOn: string;
    endsOn: string;
    usageLimit: number | null;
  } | null;
  today: string;
};

/** The first invoice as the setup stands. It does no maths of its own: computeInvoice() decides every number. */
export function previewSetup(input: SetupPreviewInput): { unitPricePaise: number; invoice: InvoiceComputation } {
  const unitPricePaise = variantUnitPricePaise(input.planPricePaise ?? input.salesPricePaise, input.extraPricePaise);
  const discounts: DiscountRule[] = input.discount
    ? [{ ...input.discount, id: "new-discount", productIds: [NEW_PRODUCT], usageCount: 0 }]
    : [];
  return {
    unitPricePaise,
    invoice: computeInvoice({
      lines: [
        {
          productId: NEW_PRODUCT,
          description: input.productName,
          quantity: input.quantity,
          unitPricePaise,
          taxes: input.taxes,
        },
      ],
      discounts,
      on: input.today,
    }),
  };
}
