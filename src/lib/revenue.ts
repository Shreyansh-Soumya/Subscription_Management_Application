import { and, count, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { plans, subscriptionLines, subscriptions } from "@/db/schema";
import { appToday } from "./clock";
import type { BillingFrequency } from "./dates";

const PERIODS_PER_YEAR: Record<BillingFrequency, number> = { daily: 365, weekly: 52, monthly: 12, yearly: 1 };

export type RecurringRevenue = { mrrPaise: number; arrPaise: number; activeSubscriptions: number };

/**
 * What the company earns on repeat from subscriptions running today, before tax and discounts.
 * Paused and expired subscriptions don't count. MRR is the yearly figure divided by 12.
 */
export async function getRecurringRevenue(db: Db): Promise<RecurringRevenue> {
  const today = await appToday(db);
  const running = and(
    eq(subscriptions.status, "active"),
    or(isNull(subscriptions.expiryDate), gt(subscriptions.expiryDate, today)),
  );

  const [totals, [{ activeSubscriptions }]] = await Promise.all([
    db
      .select({
        frequency: plans.frequency,
        amountPaise: sql<number>`coalesce(sum(${subscriptionLines.quantity}::bigint * ${subscriptionLines.unitPricePaise}), 0)`.mapWith(Number),
      })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .innerJoin(subscriptionLines, eq(subscriptionLines.subscriptionId, subscriptions.id))
      .where(running)
      .groupBy(plans.frequency),
    db.select({ activeSubscriptions: count() }).from(subscriptions).where(running),
  ]);

  const arrPaise = totals.reduce((sum, row) => sum + row.amountPaise * PERIODS_PER_YEAR[row.frequency], 0);
  return { mrrPaise: Math.round(arrPaise / 12), arrPaise, activeSubscriptions };
}
