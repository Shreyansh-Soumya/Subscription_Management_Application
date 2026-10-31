import { z } from "zod";

/** Money columns are 32-bit Postgres integers, so this is the most they can hold (about ₹2.1 crore). */
export const MAX_PAISE = 2147483647;
export const MAX_BASIS_POINTS = 10000;

export const idSchema = z.uuid();

const text = (label: string, max = 200) =>
  z.string({ error: `Enter ${label}.` }).trim().min(1, `Enter ${label}.`).max(max, `Use ${max} characters or fewer.`);

const paise = (label: string) =>
  z
    .number({ error: `Enter ${label}.` })
    .int(`Enter ${label}.`)
    .min(0, "This can't be negative.")
    .max(MAX_PAISE, "This amount is too large.");

const whole = (label: string, min: number) =>
  z
    .number({ error: `Enter ${label}.` })
    .int(`${label} must be a whole number.`)
    .min(min, `${label} must be at least ${min}.`)
    .max(MAX_PAISE, `${label} is too large.`);

const day = (label: string) => z.iso.date({ error: `Enter ${label}.` });

export const productSchema = z.object({
  name: text("a name"),
  type: text("a type"),
  salesPricePaise: paise("a sales price"),
  costPricePaise: paise("a cost price"),
  notes: z.string().trim().max(2000, "Use 2000 characters or fewer.").optional(),
  isAddon: z.boolean().default(false),
  taxRuleIds: z.array(idSchema).max(50).optional(),
});
export type ProductInput = z.output<typeof productSchema>;

export const variantSchema = z.object({
  attribute: text("an attribute"),
  value: text("a value"),
  extraPricePaise: paise("an extra price"),
});
export type VariantInput = z.output<typeof variantSchema>;

export const planSchema = z
  .object({
    name: text("a name"),
    pricePaise: paise("a price"),
    frequency: z.enum(["daily", "weekly", "monthly", "yearly"], { error: "Choose how often it bills." }),
    minQuantity: whole("Minimum quantity", 1),
    availableFrom: day("a start date").nullable().default(null),
    availableTo: day("an end date").nullable().default(null),
    autoClose: z.boolean().default(false),
    canCloseEarly: z.boolean().default(true),
    canPause: z.boolean().default(true),
    canRenew: z.boolean().default(true),
  })
  .refine((plan) => !plan.availableFrom || !plan.availableTo || plan.availableFrom <= plan.availableTo, {
    path: ["availableTo"],
    message: "The end date can't be before the start date.",
  });
export type PlanInput = z.output<typeof planSchema>;

export const taxRuleSchema = z.object({
  name: text("a name"),
  rateBps: z
    .number({ error: "Enter a rate." })
    .int("Use at most two decimal places.")
    .min(0, "The rate can't be negative.")
    .max(MAX_BASIS_POINTS, "The rate can't be above 100%."),
  active: z.boolean().default(true),
});
export type TaxRuleInput = z.output<typeof taxRuleSchema>;

const discountFields = z.object({
  name: text("a name"),
  kind: z.enum(["percent", "fixed"], { error: "Choose a discount type." }),
  value: whole("The discount", 1),
  scope: z.enum(["product", "subscription"], { error: "Choose what it applies to." }),
  minPurchasePaise: paise("a minimum purchase").default(0),
  minQuantity: whole("Minimum quantity", 0).default(0),
  startsOn: day("a start date"),
  endsOn: day("an end date"),
  usageLimit: whole("The usage limit", 1).nullable().default(null),
});

function checkDiscount(discount: z.output<typeof discountFields>, ctx: z.RefinementCtx) {
  if (discount.kind === "percent" && discount.value > MAX_BASIS_POINTS) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "A percentage can't be above 100%." });
  }
  if (discount.startsOn > discount.endsOn) {
    ctx.addIssue({ code: "custom", path: ["endsOn"], message: "The end date can't be before the start date." });
  }
}

export const discountSchema = discountFields
  .extend({ productIds: z.array(idSchema).max(500).default([]) })
  .superRefine((discount, ctx) => {
    checkDiscount(discount, ctx);
    if (discount.scope === "product" && discount.productIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["productIds"], message: "Choose at least one product." });
    }
  });
export type DiscountInput = z.output<typeof discountSchema>;

/** A discount in guided setup: "product" means the product being set up, which has no id yet. */
export const setupDiscountSchema = discountFields.superRefine(checkDiscount);

/** Everything guided setup saves in one go. */
export const setupSchema = z
  .object({
    product: productSchema.omit({ taxRuleIds: true }),
    variants: z.array(variantSchema).max(50),
    plan: planSchema,
    taxRuleIds: z.array(idSchema).max(50),
    newTax: taxRuleSchema.nullable(),
    discount: setupDiscountSchema.nullable(),
  })
  .superRefine((setup, ctx) => {
    const seen = new Set<string>();
    setup.variants.forEach((variant, index) => {
      const key = `${variant.attribute.toLowerCase()}\n${variant.value.toLowerCase()}`;
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["variants", index], message: `${variant.attribute}: ${variant.value} is listed twice.` });
      seen.add(key);
    });
  });
export type SetupInput = z.output<typeof setupSchema>;

export type FieldErrors = Record<string, string[] | undefined>;

/** The first problem with each field, for showing beside the form. */
export function fieldErrorsOf(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors as FieldErrors;
}

/** What one unit costs with a variant chosen. Every screen that prices a variant should use this. */
export function variantUnitPricePaise(salesPricePaise: number, extraPricePaise = 0): number {
  return salesPricePaise + extraPricePaise;
}
