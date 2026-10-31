import type { Db } from "@/db";
import { createDiscount, createPlan, createTaxRule } from "./catalog-service";
import type { SetupInput } from "./catalog-validation";
import { createProduct, createProductVariant } from "./product-service";

/** Saves a whole guided setup in one transaction, so a failure part way never leaves half a product behind. */
export async function launchProduct(db: Db, setup: SetupInput, actorId: string) {
  return db.transaction(async (tx) => {
    const newTax = setup.newTax ? await createTaxRule(tx, setup.newTax, actorId) : null;
    const taxRuleIds = [...setup.taxRuleIds, ...(newTax ? [newTax.id] : [])];

    const product = await createProduct(tx, { ...setup.product, taxRuleIds }, actorId);
    for (const variant of setup.variants) await createProductVariant(tx, product.id, variant, actorId);
    const plan = await createPlan(tx, setup.plan, actorId);
    const discount = setup.discount
      ? await createDiscount(tx, { ...setup.discount, productIds: setup.discount.scope === "product" ? [product.id] : [] }, actorId)
      : null;

    return { productId: product.id, planId: plan.id, discountId: discount?.id ?? null };
  });
}
