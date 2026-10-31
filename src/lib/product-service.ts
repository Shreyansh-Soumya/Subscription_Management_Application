import { db } from "@/db";
import { products } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function getProducts() {
  return db
    .select()
    .from(products)
    .orderBy(desc(products.createdAt));
}

export async function createProduct(data: {
  name: string;
  type: string;
  salesPricePaise: number;
  costPricePaise: number;
  notes?: string;
  isAddon: boolean;
}) {
  const [product] = await db
    .insert(products)
    .values({
      name: data.name,
      type: data.type,
      salesPricePaise: data.salesPricePaise,
      costPricePaise: data.costPricePaise,
      notes: data.notes || null,
      isAddon: data.isAddon,
    })
    .returning();

  return product;
}