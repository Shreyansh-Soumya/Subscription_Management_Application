
import { asc, count, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { taxRules } from "@/db/schema";
import { logCatalogEvent } from "./product-service";
import type { TaxRuleInput } from "./catalog-validation";

export async function listTaxRules(db: Db, limit = 50, offset = 0) {
  const [items, totals] = await Promise.all([
    db.select().from(taxRules).orderBy(asc(taxRules.name)).limit(limit).offset(offset),
    db.select({ total: count() }).from(taxRules),
  ]);

  return { items, total: totals[0]?.total ?? 0 };
}

export async function createTaxRule(db: Db, data: TaxRuleInput, actorId: string) {
  return db.transaction(async (tx) => {
    const [rule] = await tx.insert(taxRules).values(data).returning();

    await logCatalogEvent(tx, {
      entityType: "tax_rule",
      entityId: rule.id,
      type: "tax_rule_created",
      note: `Created tax rule ${rule.name} at ${rule.rateBps / 100}%`,
      actorId,
    });

    return rule;
  });
}

export async function updateTaxRule(db: Db, id: string, data: TaxRuleInput, actorId: string) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(taxRules).where(eq(taxRules.id, id)).for("update");
    if (!before) return null;

    const [rule] = await tx.update(taxRules).set(data).where(eq(taxRules.id, id)).returning();

    await logCatalogEvent(tx, {
      entityType: "tax_rule",
      entityId: id,
      type: "tax_rule_updated",
      note: `Updated ${rule.name}: ${before.rateBps / 100}% → ${rule.rateBps / 100}%`,
      actorId,
    });

    return rule;
  });
}

export async function deleteTaxRule(db: Db, id: string, actorId: string) {
  return db.transaction(async (tx) => {
    const [rule] = await tx.delete(taxRules).where(eq(taxRules.id, id)).returning();
    if (!rule) return null;

    await logCatalogEvent(tx, {
      entityType: "tax_rule",
      entityId: id,
      type: "tax_rule_deleted",
      note: `Deleted tax rule ${rule.name}`,
      actorId,
    });

    return rule;
  });
}
