import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";

export type PlanInput = {
  name: string;
  pricePaise: number;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  minQuantity: number;
  availableFrom: string | null;
  availableTo: string | null;
  autoClose: boolean;
  canCloseEarly: boolean;
  canPause: boolean;
  canRenew: boolean;
};

export async function getPlans(limit = 50, offset = 0) {
  const [items, total] = await Promise.all([
    db.select().from(plans)
      .orderBy(desc(plans.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(plans),
  ]);

  return { items, total: total[0]?.total ?? 0 };
}

export async function createPlan(data: PlanInput) {
  const [plan] = await db.insert(plans).values(data).returning();
  return plan;
}

export async function updatePlan(id: string, data: PlanInput) {
  const [plan] = await db.update(plans)
    .set(data)
    .where(eq(plans.id, id))
    .returning();

  return plan ?? null;
}

export async function deletePlan(id: string) {
  const [plan] = await db.delete(plans)
    .where(eq(plans.id, id))
    .returning();

  return plan ?? null;
}