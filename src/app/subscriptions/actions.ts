
"use server";

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  customers,
  discounts,
  events,
  plans,
  productTaxes,
  productVariants,
  products,
  subscriptionDiscounts,
  subscriptionLineTaxes,
  subscriptionLines,
  subscriptions,
  taxRules,
} from "@/db/schema";

import { getServerSession } from "@/lib/auth-guard";
import { appNow, appToday } from "@/lib/clock";
import { nextNumber } from "@/lib/numbers";

const createSubscriptionSchema = z.object({
  customerId: z.string().uuid(),
  planId: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1).max(100000),
  startDate: z.iso.date(),
  expiryDate: z.iso.date().nullable().optional(),
  paymentTermsDays: z.number().int().min(0).max(365),
  discountIds: z.array(z.string().uuid()).default([]),
});

export type CreateSubscriptionInput = z.input<
  typeof createSubscriptionSchema
>;

export type CreateSubscriptionResult =
  | { success: true; subscriptionId: string; number: string }
  | { success: false; error: string };

export async function createSubscription(
  input: CreateSubscriptionInput,
): Promise<CreateSubscriptionResult> {
  const session = await getServerSession();

  if (!session) {
    return { success: false, error: "Please log in first." };
  }

  if (session.user.role !== "admin" && session.user.role !== "staff") {
    return {
      success: false,
      error: "You are not allowed to create subscriptions.",
    };
  }

  const parsed = createSubscriptionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: "Please check the subscription details.",
    };
  }

  const data = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      const today = await appToday(tx);

      if (data.expiryDate && data.expiryDate < data.startDate) {
        throw new Error("Expiry date cannot be before the start date.");
      }

      const [customer] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.id, data.customerId))
        .limit(1);

      if (!customer) {
        throw new Error("Selected customer does not exist.");
      }

      const [plan] = await tx
        .select()
        .from(plans)
        .where(eq(plans.id, data.planId))
        .limit(1);

      if (!plan) {
        throw new Error("Selected plan does not exist.");
      }

      if (data.quantity < plan.minQuantity) {
        throw new Error(
          `This plan requires a minimum quantity of ${plan.minQuantity}.`,
        );
      }

      if (
        (plan.availableFrom && data.startDate < plan.availableFrom) ||
        (plan.availableTo && data.startDate > plan.availableTo)
      ) {
        throw new Error("This plan is not available on the selected start date.");
      }

      if (data.startDate < today) {
        throw new Error("Start date cannot be in the past.");
      }

      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, data.productId))
        .limit(1);

      if (!product) {
        throw new Error("Selected product does not exist.");
      }

      let variantDescription = "";

      if (data.variantId) {
        const [variant] = await tx
          .select()
          .from(productVariants)
          .where(
            and(
              eq(productVariants.id, data.variantId),
              eq(productVariants.productId, data.productId),
            ),
          )
          .limit(1);

        if (!variant) {
          throw new Error("Selected variant does not belong to this product.");
        }

        variantDescription = ` (${variant.attribute}: ${variant.value})`;
      }

      const uniqueDiscountIds = [...new Set(data.discountIds)];

      let selectedDiscounts: typeof discounts.$inferSelect[] = [];

      if (uniqueDiscountIds.length > 0) {
        selectedDiscounts = await tx
          .select()
          .from(discounts)
          .where(
            and(
              inArray(discounts.id, uniqueDiscountIds),
              eq(discounts.scope, "subscription"),
            ),
          );

        if (selectedDiscounts.length !== uniqueDiscountIds.length) {
          throw new Error("One or more selected discounts are invalid.");
        }

        for (const discount of selectedDiscounts) {
          if (today < discount.startsOn || today > discount.endsOn) {
            throw new Error(`${discount.name} is not currently valid.`);
          }

          if (
            discount.usageLimit !== null &&
            discount.usageCount >= discount.usageLimit
          ) {
            throw new Error(`${discount.name} has reached its usage limit.`);
          }
        }
      }

      const taxRows = await tx
        .select({
          taxRuleId: taxRules.id,
        })
        .from(productTaxes)
        .innerJoin(
          taxRules,
          eq(productTaxes.taxRuleId, taxRules.id),
        )
        .where(
          and(
            eq(productTaxes.productId, product.id),
            eq(taxRules.active, true),
          ),
        );

      const now = await appNow(tx);
      const number = await nextNumber(tx, "SUB");

      const [subscription] = await tx
        .insert(subscriptions)
        .values({
          number,
          customerId: customer.id,
          planId: plan.id,
          status: "draft",
          startDate: data.startDate,
          expiryDate: data.expiryDate ?? null,
          paymentTermsDays: data.paymentTermsDays,
          nextBillingDate: null,
        })
        .returning();

      const [line] = await tx
        .insert(subscriptionLines)
        .values({
          subscriptionId: subscription.id,
          productId: product.id,
          variantId: data.variantId ?? null,
          description: `${product.name}${variantDescription}`,
          quantity: data.quantity,
          unitPricePaise: plan.pricePaise,
        })
        .returning();

      if (taxRows.length > 0) {
        await tx.insert(subscriptionLineTaxes).values(
          taxRows.map((tax) => ({
            lineId: line.id,
            taxRuleId: tax.taxRuleId,
          })),
        );
      }

      if (selectedDiscounts.length > 0) {
        await tx.insert(subscriptionDiscounts).values(
          selectedDiscounts.map((discount) => ({
            subscriptionId: subscription.id,
            discountId: discount.id,
          })),
        );
      }

      await tx.insert(events).values({
        entityType: "subscription",
        entityId: subscription.id,
        type: "status_changed",
        toStatus: "draft",
        note: "Subscription created",
        actorId: session.user.id,
        occurredAt: now,
      });

      return {
        subscriptionId: subscription.id,
        number: subscription.number,
      };
    });

    return { success: true, ...result };
  } catch (error) {
    console.error("Subscription creation failed:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to create subscription.",
    };
  }
}
