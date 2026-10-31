"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  plans,
  products,
  productVariants,
  quotationTemplates,
  quotationTemplateLines,
} from "@/db/schema";
import { getServerSession } from "@/lib/auth-guard";

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  planId: z.string().uuid(),
  validityDays: z.number().int().min(1).max(365),
  notes: z.string().trim().max(1000),
  lines: z.array(
    z.object({
      productId: z.string().uuid(),
      variantId: z.string().uuid().nullable(),
      quantity: z.number().int().min(1).max(100000),
    }),
  ).min(1).max(30),
});

export type TemplateInput = z.infer<typeof schema>;

export async function createQuoteTemplate(input: TemplateInput) {
  const session = await getServerSession();

  if (!session) return { success: false as const, error: "Please log in first." };
  if (session.user.role !== "admin" && session.user.role !== "staff") {
    return { success: false as const, error: "You are not allowed to create templates." };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: "Please check the template details." };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [plan] = await tx.select({ id: plans.id }).from(plans)
        .where(eq(plans.id, parsed.data.planId)).limit(1);
      if (!plan) throw new Error("Selected plan does not exist.");

      for (const line of parsed.data.lines) {
        const [product] = await tx.select({ id: products.id }).from(products)
          .where(eq(products.id, line.productId)).limit(1);
        if (!product) throw new Error("A selected product does not exist.");

        if (line.variantId) {
          const [variant] = await tx.select({ id: productVariants.id })
            .from(productVariants)
            .where(eq(productVariants.id, line.variantId))
            .limit(1);
          if (!variant) throw new Error("A selected variant does not exist.");

          const [ownedVariant] = await tx.select({ id: productVariants.id })
            .from(productVariants)
            .where(eq(productVariants.productId, line.productId))
            .limit(1);

          if (!ownedVariant || ownedVariant.id !== line.variantId) {
            throw new Error("A selected variant does not belong to its product.");
          }
        }
      }

      const [template] = await tx.insert(quotationTemplates).values({
        name: parsed.data.name,
        planId: parsed.data.planId,
        validityDays: parsed.data.validityDays,
        notes: parsed.data.notes || null,
      }).returning({ id: quotationTemplates.id });

      await tx.insert(quotationTemplateLines).values(
        parsed.data.lines.map((line) => ({
          templateId: template.id,
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
        })),
      );

      return template;
    });

    return { success: true as const, id: result.id };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not create template.",
    };
  }
}
