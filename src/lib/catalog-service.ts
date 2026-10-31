import { asc, count, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { discountProducts, discounts, plans, products, subscriptionDiscounts, taxRules } from "@/db/schema";
import { CatalogConflict } from "./api-helpers";
import type { DiscountInput, PlanInput, TaxRuleInput } from "./catalog-validation";
import type { DiscountRule } from "./compute-invoice";
import { logCatalogEvent, PAGE_SIZE } from "./product-service";

/* Plans */

export async function listPlans(db: Db, { page }: { page: number }) {
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(plans),
    db.select().from(plans).orderBy(desc(plans.createdAt), asc(plans.id)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
  ]);
  return { rows, total, page, pageSize: PAGE_SIZE };
}

export async function createPlan(db: Db, data: PlanInput, actorId: string) {
  return db.transaction(async (tx) => {
    const [plan] = await tx.insert(plans).values(data).returning();
    await logCatalogEvent(tx, { entityType: "plan", entityId: plan.id, type: "plan_created", note: `Added ${plan.name}`, actorId });
    return plan;
  });
}

export async function updatePlan(db: Db, id: string, data: PlanInput, actorId: string) {
  return db.transaction(async (tx) => {
    const [plan] = await tx.update(plans).set(data).where(eq(plans.id, id)).returning();
    if (!plan) return null;
    await logCatalogEvent(tx, { entityType: "plan", entityId: id, type: "plan_updated", note: `Updated ${plan.name}`, actorId });
    return plan;
  });
}

export async function deletePlan(db: Db, id: string, actorId: string) {
  return db.transaction(async (tx) => {
    const [plan] = await tx.delete(plans).where(eq(plans.id, id)).returning();
    if (!plan) return null;
    await logCatalogEvent(tx, { entityType: "plan", entityId: id, type: "plan_deleted", note: `Deleted ${plan.name}`, actorId });
    return plan;
  });
}

/* Tax rules */

export async function listTaxRules(db: Db, { page }: { page: number }) {
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(taxRules),
    db.select().from(taxRules).orderBy(asc(taxRules.name), asc(taxRules.id)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
  ]);
  return { rows, total, page, pageSize: PAGE_SIZE };
}

/** Tax rules to offer in a product form. Rates are needed for the price preview. */
export async function taxRuleOptions(db: Db) {
  return db
    .select({ id: taxRules.id, name: taxRules.name, rateBps: taxRules.rateBps, active: taxRules.active })
    .from(taxRules)
    .orderBy(asc(taxRules.name))
    .limit(200);
}

export async function createTaxRule(db: Db, data: TaxRuleInput, actorId: string) {
  return db.transaction(async (tx) => {
    const [rule] = await tx.insert(taxRules).values(data).returning();
    await logCatalogEvent(tx, { entityType: "tax_rule", entityId: rule.id, type: "tax_rule_created", note: `Added ${rule.name}`, actorId });
    return rule;
  });
}

export async function updateTaxRule(db: Db, id: string, data: TaxRuleInput, actorId: string) {
  return db.transaction(async (tx) => {
    const [rule] = await tx.update(taxRules).set(data).where(eq(taxRules.id, id)).returning();
    if (!rule) return null;
    await logCatalogEvent(tx, { entityType: "tax_rule", entityId: id, type: "tax_rule_updated", note: `Updated ${rule.name}`, actorId });
    return rule;
  });
}

export async function deleteTaxRule(db: Db, id: string, actorId: string) {
  return db.transaction(async (tx) => {
    const [rule] = await tx.delete(taxRules).where(eq(taxRules.id, id)).returning();
    if (!rule) return null;
    await logCatalogEvent(tx, { entityType: "tax_rule", entityId: id, type: "tax_rule_deleted", note: `Deleted ${rule.name}`, actorId });
    return rule;
  });
}

/* Discounts */

export async function listDiscounts(db: Db, { page }: { page: number }) {
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(discounts),
    db.select().from(discounts).orderBy(desc(discounts.createdAt), asc(discounts.id)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
  ]);
  const links = rows.length
    ? await db.select().from(discountProducts).where(inArray(discountProducts.discountId, rows.map((row) => row.id)))
    : [];
  return {
    rows: rows.map((row) => ({
      ...row,
      productIds: links.filter((link) => link.discountId === row.id).map((link) => link.productId),
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function productOptions(db: Db) {
  return db.select({ id: products.id, name: products.name }).from(products).orderBy(asc(products.name)).limit(500);
}

/** Product discounts in the shape computeInvoice() takes, so previews apply the same rules as billing. */
export async function productDiscountRules(db: Db): Promise<DiscountRule[]> {
  const rows = await db.select().from(discounts).where(eq(discounts.scope, "product")).orderBy(asc(discounts.createdAt), asc(discounts.id)).limit(200);
  const links = rows.length
    ? await db.select().from(discountProducts).where(inArray(discountProducts.discountId, rows.map((row) => row.id)))
    : [];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    value: row.value,
    scope: row.scope,
    productIds: links.filter((link) => link.discountId === row.id).map((link) => link.productId),
    minPurchasePaise: row.minPurchasePaise,
    minQuantity: row.minQuantity,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    usageLimit: row.usageLimit,
    usageCount: row.usageCount,
  }));
}

async function saveDiscountProducts(db: Db, discountId: string, productIds: string[]) {
  await db.delete(discountProducts).where(eq(discountProducts.discountId, discountId));
  const unique = [...new Set(productIds)];
  if (unique.length) await db.insert(discountProducts).values(unique.map((productId) => ({ discountId, productId })));
}

export async function createDiscount(db: Db, { productIds, ...data }: DiscountInput, actorId: string) {
  return db.transaction(async (tx) => {
    const [discount] = await tx.insert(discounts).values(data).returning();
    await saveDiscountProducts(tx, discount.id, data.scope === "product" ? productIds : []);
    await logCatalogEvent(tx, { entityType: "discount", entityId: discount.id, type: "discount_created", note: `Added ${discount.name}`, actorId });
    return discount;
  });
}

export async function updateDiscount(db: Db, id: string, { productIds, ...data }: DiscountInput, actorId: string) {
  return db.transaction(async (tx) => {
    const [discount] = await tx.update(discounts).set(data).where(eq(discounts.id, id)).returning();
    if (!discount) return null;
    await saveDiscountProducts(tx, id, data.scope === "product" ? productIds : []);
    await logCatalogEvent(tx, { entityType: "discount", entityId: id, type: "discount_updated", note: `Updated ${discount.name}`, actorId });
    return discount;
  });
}

/** Deleting a discount in use would silently change what customers are billed next, so it's refused. */
export async function deleteDiscount(db: Db, id: string, actorId: string) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(discounts).where(eq(discounts.id, id)).for("update");
    if (!existing) return null;
    const [{ attached }] = await tx
      .select({ attached: count() })
      .from(subscriptionDiscounts)
      .where(eq(subscriptionDiscounts.discountId, id));
    if (existing.usageCount > 0 || attached > 0) {
      throw new CatalogConflict("This discount is in use. Set its end date to stop it instead.");
    }
    await tx.delete(discounts).where(eq(discounts.id, id));
    await logCatalogEvent(tx, { entityType: "discount", entityId: id, type: "discount_deleted", note: `Deleted ${existing.name}`, actorId });
    return existing;
  });
}
