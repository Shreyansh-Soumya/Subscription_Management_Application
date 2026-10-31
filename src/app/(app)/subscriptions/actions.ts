
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
  quotationTemplateLines,
  quotationTemplates,
  subscriptionDiscounts,
  subscriptionLineTaxes,
  subscriptionLines,
  subscriptions,
  taxRules,
} from "@/db/schema";

import { getServerSession } from "@/lib/permissions";
import { appNow, appToday } from "@/lib/clock";
import { nextNumber } from "@/lib/numbers";
import { addDays } from "@/lib/dates";
import { variantUnitPricePaise } from "@/lib/catalog-validation";

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
      let variantExtraPaise = 0;

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
        variantExtraPaise = variant.extraPricePaise;
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
          unitPricePaise: variantUnitPricePaise(plan.pricePaise, variantExtraPaise),
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

const quoteFromTemplateSchema = z.object({
  templateId: z.string().uuid(),
  customerId: z.string().uuid(),
});

/** Starts a quote from a template: its plan and lines are copied in, and it expires after the template's validity. */
export async function createQuoteFromTemplate(
  input: z.input<typeof quoteFromTemplateSchema>,
): Promise<CreateSubscriptionResult> {
  const session = await getServerSession();
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return { success: false, error: "You are not allowed to create quotes." };
  }
  const parsed = quoteFromTemplateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Choose a template and a customer." };

  try {
    const result = await db.transaction(async (tx) => {
      const today = await appToday(tx);
      const [row] = await tx
        .select({ template: quotationTemplates, plan: plans })
        .from(quotationTemplates)
        .innerJoin(plans, eq(quotationTemplates.planId, plans.id))
        .where(eq(quotationTemplates.id, parsed.data.templateId));
      if (!row) throw new Error("Selected template does not exist.");
      const { template, plan } = row;

      if ((plan.availableFrom && today < plan.availableFrom) || (plan.availableTo && today > plan.availableTo)) {
        throw new Error(`The ${plan.name} plan isn't available today.`);
      }

      const [customer] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, parsed.data.customerId));
      if (!customer) throw new Error("Selected customer does not exist.");

      const templateLines = await tx
        .select({ line: quotationTemplateLines, product: products, variant: productVariants })
        .from(quotationTemplateLines)
        .innerJoin(products, eq(quotationTemplateLines.productId, products.id))
        .leftJoin(productVariants, eq(quotationTemplateLines.variantId, productVariants.id))
        .where(eq(quotationTemplateLines.templateId, template.id));
      if (templateLines.length === 0) throw new Error("This template has no products.");

      const seats = templateLines.filter(({ product }) => !product.isAddon).reduce((sum, { line }) => sum + line.quantity, 0);
      if (seats < plan.minQuantity) throw new Error(`This plan requires a minimum quantity of ${plan.minQuantity}.`);

      const number = await nextNumber(tx, "SUB");
      const [subscription] = await tx
        .insert(subscriptions)
        .values({
          number,
          customerId: customer.id,
          planId: plan.id,
          templateId: template.id,
          status: "quotation",
          startDate: today,
          quoteValidUntil: addDays(today, template.validityDays),
        })
        .returning();

      for (const { line, product, variant } of templateLines) {
        const [created] = await tx
          .insert(subscriptionLines)
          .values({
            subscriptionId: subscription.id,
            productId: product.id,
            variantId: line.variantId,
            description: variant ? `${product.name} (${variant.attribute}: ${variant.value})` : product.name,
            quantity: line.quantity,
            unitPricePaise: product.isAddon
              ? variantUnitPricePaise(product.salesPricePaise, variant?.extraPricePaise)
              : variantUnitPricePaise(plan.pricePaise, variant?.extraPricePaise),
          })
          .returning({ id: subscriptionLines.id });
        const taxes = await tx
          .select({ taxRuleId: taxRules.id })
          .from(productTaxes)
          .innerJoin(taxRules, eq(productTaxes.taxRuleId, taxRules.id))
          .where(and(eq(productTaxes.productId, product.id), eq(taxRules.active, true)));
        if (taxes.length > 0) {
          await tx.insert(subscriptionLineTaxes).values(taxes.map((tax) => ({ lineId: created.id, taxRuleId: tax.taxRuleId })));
        }
      }

      await tx.insert(events).values({
        entityType: "subscription",
        entityId: subscription.id,
        type: "status_changed",
        toStatus: "quotation",
        note: `Quote started from the ${template.name} template`,
        actorId: session.user.id,
        occurredAt: await appNow(tx),
      });
      return { subscriptionId: subscription.id, number: subscription.number };
    });
    return { success: true, ...result };
  } catch (error) {
    console.error("Quote creation failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unable to create the quote." };
  }
}
