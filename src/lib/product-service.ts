
import { desc, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { products, productVariants } from "@/db/schema";

export type ProductInput = {
  name: string;
  type: string;
  salesPricePaise: number;
  costPricePaise: number;
  notes?: string;
  isAddon: boolean;
};

export type VariantInput = {
  attribute: string;
  value: string;
  extraPricePaise: number;
};

export async function getProducts() {
  return db
    .select()
    .from(products)
    .orderBy(desc(products.createdAt));
}

export async function createProduct(data: ProductInput) {
  const [product] = await db
    .insert(products)
    .values({
      ...data,
      notes: data.notes || null,
    })
    .returning();

  return product;
}

export async function updateProduct(
  id: string,
  data: ProductInput,
) {
  const [product] = await db
    .update(products)
    .set({
      ...data,
      notes: data.notes || null,
    })
    .where(eq(products.id, id))
    .returning();

  return product ?? null;
}

export async function deleteProduct(id: string) {
  const [product] = await db
    .delete(products)
    .where(eq(products.id, id))
    .returning();

  return product ?? null;
}

export async function getProductVariants(productId: string) {
  return db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, productId));
}

export async function createProductVariant(
  productId: string,
  data: VariantInput,
) {
  const [variant] = await db
    .insert(productVariants)
    .values({
      productId,
      ...data,
    })
    .returning();

  return variant;
}

export async function updateProductVariant(
  productId: string,
  variantId: string,
  data: VariantInput,
) {
  const [variant] = await db
    .update(productVariants)
    .set(data)
    .where(
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.productId, productId),
      ),
    )
    .returning();

  return variant ?? null;
}

export async function deleteProductVariant(
  productId: string,
  variantId: string,
) {
  const [variant] = await db
    .delete(productVariants)
    .where(
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.productId, productId),
      ),
    )
    .returning();

  return variant ?? null;
}
