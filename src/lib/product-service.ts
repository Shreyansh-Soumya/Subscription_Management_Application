import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { events, productTaxes, products, productVariants } from "@/db/schema";
import { appNow } from "./clock";
import type { ProductInput, VariantInput } from "./catalog-validation";
import { formatMoney } from "./money";

export const PAGE_SIZE = 20;

/** Reads a page number from a query string, falling back to the first page. */
export function pageFrom(value: string | string[] | null | undefined): number {
  const page = Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

/** Records who changed the catalogue. Prices decide what customers pay, so changes must be traceable. */
export async function logCatalogEvent(
  db: Db,
  input: { entityType: "product" | "plan" | "tax_rule" | "discount"; entityId: string; type: string; note: string; actorId: string },
): Promise<void> {
  await db.insert(events).values({ ...input, occurredAt: await appNow(db) });
}

export async function listProducts(db: Db, { page }: { page: number }) {
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(products),
    db
      .select()
      .from(products)
      .orderBy(desc(products.createdAt), asc(products.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);
  const links = rows.length
    ? await db.select().from(productTaxes).where(inArray(productTaxes.productId, rows.map((row) => row.id)))
    : [];
  return {
    rows: rows.map((row) => ({
      ...row,
      taxRuleIds: links.filter((link) => link.productId === row.id).map((link) => link.taxRuleId),
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function productExists(db: Db, id: string): Promise<boolean> {
  const [row] = await db.select({ id: products.id }).from(products).where(eq(products.id, id));
  return Boolean(row);
}

async function saveTaxes(db: Db, productId: string, taxRuleIds: string[]) {
  await db.delete(productTaxes).where(eq(productTaxes.productId, productId));
  const unique = [...new Set(taxRuleIds)];
  if (unique.length) await db.insert(productTaxes).values(unique.map((taxRuleId) => ({ productId, taxRuleId })));
}

export async function createProduct(db: Db, { taxRuleIds, ...data }: ProductInput, actorId: string) {
  return db.transaction(async (tx) => {
    const [product] = await tx.insert(products).values({ ...data, notes: data.notes || null }).returning();
    await saveTaxes(tx, product.id, taxRuleIds ?? []);
    await logCatalogEvent(tx, {
      entityType: "product",
      entityId: product.id,
      type: "product_created",
      note: `Added ${product.name} at ${formatMoney(product.salesPricePaise)}`,
      actorId,
    });
    return product;
  });
}

export async function updateProduct(db: Db, id: string, { taxRuleIds, ...data }: ProductInput, actorId: string) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(products).where(eq(products.id, id)).for("update");
    if (!before) return null;
    const [product] = await tx
      .update(products)
      .set({ ...data, notes: data.notes || null })
      .where(eq(products.id, id))
      .returning();
    if (taxRuleIds) await saveTaxes(tx, id, taxRuleIds);
    await logCatalogEvent(tx, {
      entityType: "product",
      entityId: id,
      type: "product_updated",
      note:
        before.salesPricePaise === product.salesPricePaise
          ? `Updated ${product.name}`
          : `Changed ${product.name} from ${formatMoney(before.salesPricePaise)} to ${formatMoney(product.salesPricePaise)}`,
      actorId,
    });
    return product;
  });
}

export async function deleteProduct(db: Db, id: string, actorId: string) {
  return db.transaction(async (tx) => {
    const [product] = await tx.delete(products).where(eq(products.id, id)).returning();
    if (!product) return null;
    await logCatalogEvent(tx, {
      entityType: "product",
      entityId: id,
      type: "product_deleted",
      note: `Deleted ${product.name}`,
      actorId,
    });
    return product;
  });
}

export async function getProductVariants(db: Db, productId: string) {
  return db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, productId))
    .orderBy(asc(productVariants.attribute), asc(productVariants.value));
}

export async function createProductVariant(db: Db, productId: string, data: VariantInput, actorId: string) {
  return db.transaction(async (tx) => {
    const [variant] = await tx.insert(productVariants).values({ productId, ...data }).returning();
    await logCatalogEvent(tx, {
      entityType: "product",
      entityId: productId,
      type: "variant_created",
      note: `Added ${variant.attribute}: ${variant.value} at +${formatMoney(variant.extraPricePaise)}`,
      actorId,
    });
    return variant;
  });
}

export async function updateProductVariant(
  db: Db,
  productId: string,
  variantId: string,
  data: VariantInput,
  actorId: string,
) {
  return db.transaction(async (tx) => {
    const [variant] = await tx
      .update(productVariants)
      .set(data)
      .where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId)))
      .returning();
    if (!variant) return null;
    await logCatalogEvent(tx, {
      entityType: "product",
      entityId: productId,
      type: "variant_updated",
      note: `Set ${variant.attribute}: ${variant.value} to +${formatMoney(variant.extraPricePaise)}`,
      actorId,
    });
    return variant;
  });
}

export async function deleteProductVariant(db: Db, productId: string, variantId: string, actorId: string) {
  return db.transaction(async (tx) => {
    const [variant] = await tx
      .delete(productVariants)
      .where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId)))
      .returning();
    if (!variant) return null;
    await logCatalogEvent(tx, {
      entityType: "product",
      entityId: productId,
      type: "variant_deleted",
      note: `Deleted ${variant.attribute}: ${variant.value}`,
      actorId,
    });
    return variant;
  });
}
