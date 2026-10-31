import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { CatalogConflict, failureResponse, isValidId, postgresErrorCode } from "./api-helpers";
import {
  createDiscount,
  createPlan,
  createTaxRule,
  deleteDiscount,
  deletePlan,
  listPlans,
  productDiscountRules,
} from "./catalog-service";
import {
  discountSchema,
  MAX_PAISE,
  planSchema,
  productSchema,
  type SetupInput,
  setupSchema,
  variantSchema,
  variantUnitPricePaise,
} from "./catalog-validation";
import { computeInvoice } from "./compute-invoice";
import { previewSetup } from "./setup-preview";
import { launchProduct } from "./setup-service";
import {
  createProduct,
  createProductVariant,
  deleteProduct,
  deleteProductVariant,
  getProductVariants,
  listProducts,
  pageFrom,
  PAGE_SIZE,
  updateProduct,
} from "./product-service";

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let db: TestDb;
const ACTOR = "admin-1";

const product = { name: "Suite", type: "Software", salesPricePaise: 120000, costPricePaise: 30000, isAddon: false };
const failureOf = async (work: Promise<unknown>) => work.then(() => null, (error: unknown) => error);

beforeEach(async () => {
  db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(schema.user).values({ id: ACTOR, name: "Admin", email: "a@b.test", role: "admin", emailVerified: true });
});

describe("validation", () => {
  it("rejects prices the database can't hold, and accepts the largest it can", () => {
    expect(productSchema.safeParse({ ...product, salesPricePaise: MAX_PAISE }).success).toBe(true);
    const tooBig = productSchema.safeParse({ ...product, salesPricePaise: MAX_PAISE + 1 });
    expect(tooBig.success).toBe(false);
    expect(variantSchema.safeParse({ attribute: "Brand", value: "Odoo", extraPricePaise: 3000000000 }).success).toBe(false);
  });

  it("reports a missing price against its own field", () => {
    const result = variantSchema.safeParse({ attribute: "Brand", value: "Odoo" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["extraPricePaise"]);
  });

  it("rejects plan dates in the wrong order", () => {
    const result = planSchema.safeParse({ name: "P", pricePaise: 1, frequency: "monthly", minQuantity: 1, availableFrom: "2026-12-01", availableTo: "2026-11-01" });
    expect(result.error?.issues[0].path).toEqual(["availableTo"]);
  });

  it("requires products for a product discount and caps percentages at 100", () => {
    const base = { name: "D", kind: "percent", value: 1000, scope: "product", startsOn: "2026-01-01", endsOn: "2026-12-31" };
    expect(discountSchema.safeParse(base).error?.issues[0].path).toEqual(["productIds"]);
    expect(discountSchema.safeParse({ ...base, scope: "subscription", value: 10001 }).error?.issues[0].path).toEqual(["value"]);
    expect(discountSchema.safeParse({ ...base, scope: "subscription" }).success).toBe(true);
  });

  it("only accepts real ids and sensible page numbers", () => {
    expect(isValidId("not-a-uuid")).toBe(false);
    expect(isValidId("5099544e-08c1-4a7c-aee9-e16484c8305e")).toBe(true);
    expect([pageFrom("3"), pageFrom("0"), pageFrom("abc"), pageFrom(null)]).toEqual([3, 1, 1, 1]);
  });
});

describe("products and variants", () => {
  it("adds 560 to the price when the Odoo brand is chosen", async () => {
    const suite = await createProduct(db, product, ACTOR);
    const odoo = await createProductVariant(db, suite.id, { attribute: "Brand", value: "Odoo", extraPricePaise: 56000 }, ACTOR);
    expect(variantUnitPricePaise(suite.salesPricePaise, odoo.extraPricePaise) - suite.salesPricePaise).toBe(56000);
  });

  it("saves taxes with the product and replaces them on update", async () => {
    const gst = await createTaxRule(db, { name: "GST", rateBps: 1800, active: true }, ACTOR);
    const vat = await createTaxRule(db, { name: "VAT", rateBps: 500, active: true }, ACTOR);
    const suite = await createProduct(db, { ...product, taxRuleIds: [gst.id] }, ACTOR);
    expect((await listProducts(db, { page: 1 })).rows[0].taxRuleIds).toEqual([gst.id]);
    await updateProduct(db, suite.id, { ...product, taxRuleIds: [vat.id] }, ACTOR);
    expect((await listProducts(db, { page: 1 })).rows[0].taxRuleIds).toEqual([vat.id]);
  });

  it("rolls back the product when a tax rule doesn't exist", async () => {
    const error = await failureOf(createProduct(db, { ...product, taxRuleIds: ["5099544e-08c1-4a7c-aee9-e16484c8305e"] }, ACTOR));
    expect(postgresErrorCode(error)).toBe("23503");
    expect((await listProducts(db, { page: 1 })).total).toBe(0);
  });

  it("logs who changed a price, and from what to what", async () => {
    const suite = await createProduct(db, product, ACTOR);
    await updateProduct(db, suite.id, { ...product, salesPricePaise: 150000 }, ACTOR);
    const [event] = await db
      .select()
      .from(schema.events)
      .where(and(eq(schema.events.entityId, suite.id), eq(schema.events.type, "product_updated")));
    expect(event.actorId).toBe(ACTOR);
    expect(event.note).toContain("1,200");
    expect(event.note).toContain("1,500");
  });

  it("paginates on the server and totals in the database", async () => {
    await db.insert(schema.products).values(
      Array.from({ length: PAGE_SIZE + 3 }, (_, index) => ({ ...product, name: `P${index}` })),
    );
    const first = await listProducts(db, { page: 1 });
    const second = await listProducts(db, { page: 2 });
    expect([first.rows.length, second.rows.length, first.total]).toEqual([PAGE_SIZE, 3, PAGE_SIZE + 3]);
    expect(new Set([...first.rows, ...second.rows].map((row) => row.id)).size).toBe(PAGE_SIZE + 3);
  });

  it("returns a clear 409 for a duplicate variant, and a 500 for anything unexpected", async () => {
    const suite = await createProduct(db, product, ACTOR);
    const variant = { attribute: "Brand", value: "Odoo", extraPricePaise: 56000 };
    await createProductVariant(db, suite.id, variant, ACTOR);
    const duplicate = failureResponse(await failureOf(createProductVariant(db, suite.id, variant, ACTOR)), {
      fallback: "No",
      duplicate: "Already there",
    });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: "Already there" });
    expect(failureResponse(new Error("database down"), { fallback: "No", duplicate: "Already there" }).status).toBe(500);
  });

  it("refuses to delete a product or variant that's in use, and keeps it", async () => {
    const suite = await createProduct(db, product, ACTOR);
    const odoo = await createProductVariant(db, suite.id, { attribute: "Brand", value: "Odoo", extraPricePaise: 56000 }, ACTOR);
    const plan = await createPlan(db, { name: "Monthly", pricePaise: 1, frequency: "monthly", minQuantity: 1, availableFrom: null, availableTo: null, autoClose: false, canCloseEarly: true, canPause: true, canRenew: true }, ACTOR);
    const [customer] = await db.insert(schema.customers).values({ name: "Acme", email: "a@acme.test" }).returning();
    const [subscription] = await db.insert(schema.subscriptions).values({ number: "SUB-1", customerId: customer.id, planId: plan.id, startDate: "2026-10-01" }).returning();
    await db.insert(schema.subscriptionLines).values({ subscriptionId: subscription.id, productId: suite.id, variantId: odoo.id, description: "Suite", quantity: 1, unitPricePaise: 176000 });

    expect(postgresErrorCode(await failureOf(deleteProduct(db, suite.id, ACTOR)))).toBe("23503");
    expect(postgresErrorCode(await failureOf(deleteProductVariant(db, suite.id, odoo.id, ACTOR)))).toBe("23503");
    expect(postgresErrorCode(await failureOf(deletePlan(db, plan.id, ACTOR)))).toBe("23503");
    expect(await getProductVariants(db, suite.id)).toHaveLength(1);
  });

  it("won't edit a variant through another product's URL", async () => {
    const one = await createProduct(db, product, ACTOR);
    const two = await createProduct(db, { ...product, name: "Other" }, ACTOR);
    const variant = await createProductVariant(db, one.id, { attribute: "Brand", value: "Odoo", extraPricePaise: 1 }, ACTOR);
    expect(await deleteProductVariant(db, two.id, variant.id, ACTOR)).toBeNull();
    expect(await getProductVariants(db, one.id)).toHaveLength(1);
  });
});

describe("guided setup", () => {
  const plan = planSchema.parse({ name: "Monthly", pricePaise: 120000, frequency: "monthly", minQuantity: 1 });
  const setup = (overrides: Partial<SetupInput> = {}): SetupInput => ({
    product,
    variants: [{ attribute: "Brand", value: "Odoo", extraPricePaise: 56000 }],
    plan,
    taxRuleIds: [],
    newTax: null,
    discount: null,
    ...overrides,
  });
  const preview = {
    productName: "Suite",
    salesPricePaise: 120000,
    planPricePaise: null,
    extraPricePaise: 0,
    quantity: 1,
    taxes: [],
    discount: null,
    today: "2026-10-31",
  };
  const tenPercent = {
    name: "10% off",
    kind: "percent" as const,
    value: 1000,
    scope: "product" as const,
    minPurchasePaise: 0,
    minQuantity: 0,
    startsOn: "2026-01-01",
    endsOn: "2026-12-31",
    usageLimit: null,
  };

  it("updates the preview when any price, tax or discount changes", () => {
    expect(previewSetup(preview).invoice.totalPaise).toBe(120000);
    expect(previewSetup({ ...preview, salesPricePaise: 100000 }).invoice.totalPaise).toBe(100000);
    expect(previewSetup({ ...preview, planPricePaise: 90000 }).invoice.totalPaise).toBe(90000);
    expect(previewSetup({ ...preview, extraPricePaise: 56000 }).unitPricePaise).toBe(176000);
    expect(previewSetup({ ...preview, taxes: [{ id: "g", name: "GST", rateBps: 1800 }] }).invoice.totalPaise).toBe(141600);
    expect(previewSetup({ ...preview, discount: tenPercent }).invoice.totalPaise).toBe(108000);
  });

  it("explains why a discount doesn't apply", () => {
    const { invoice } = previewSetup({ ...preview, discount: { ...tenPercent, endsOn: "2026-10-30" } });
    expect(invoice.discountPaise).toBe(0);
    expect(invoice.skippedDiscounts[0].reason).toBe("Expired");
  });

  it("saves everything together, and the saved rules give the preview's total", async () => {
    const gst = await createTaxRule(db, { name: "GST", rateBps: 1800, active: true }, ACTOR);
    const saved = await launchProduct(
      db,
      setup({ taxRuleIds: [gst.id], newTax: { name: "Cess", rateBps: 100, active: true }, discount: tenPercent }),
      ACTOR,
    );

    const [row] = (await listProducts(db, { page: 1 })).rows;
    expect(row.id).toBe(saved.productId);
    expect(row.taxRuleIds).toHaveLength(2);
    const [odoo] = await getProductVariants(db, saved.productId);
    expect((await listPlans(db, { page: 1 })).rows[0].id).toBe(saved.planId);
    const rules = await productDiscountRules(db);
    expect(rules[0].productIds).toEqual([saved.productId]);

    const taxes = [{ id: gst.id, name: "GST", rateBps: 1800 }, { id: "c", name: "Cess", rateBps: 100 }];
    const fromPreview = previewSetup({ ...preview, planPricePaise: plan.pricePaise, extraPricePaise: odoo.extraPricePaise, taxes, discount: tenPercent });
    const fromSaved = computeInvoice({
      lines: [{ productId: saved.productId, description: "Suite", quantity: 1, unitPricePaise: plan.pricePaise + odoo.extraPricePaise, taxes }],
      discounts: rules,
      on: "2026-10-31",
    });
    expect(fromPreview.invoice.totalPaise).toBe(fromSaved.totalPaise);
  });

  it("saves nothing at all if any part fails", async () => {
    const error = await failureOf(launchProduct(db, setup({ taxRuleIds: ["5099544e-08c1-4a7c-aee9-e16484c8305e"], newTax: { name: "Cess", rateBps: 100, active: true } }), ACTOR));
    expect(postgresErrorCode(error)).toBe("23503");
    const duplicate = { attribute: "Brand", value: "Odoo", extraPricePaise: 1 };
    expect(postgresErrorCode(await failureOf(launchProduct(db, setup({ variants: [duplicate, duplicate] }), ACTOR)))).toBe("23505");
    expect((await listProducts(db, { page: 1 })).total).toBe(0);
    expect((await listPlans(db, { page: 1 })).total).toBe(0);
    expect(await db.select().from(schema.taxRules)).toHaveLength(0);
    expect(await db.select().from(schema.events)).toHaveLength(0);
  });

  it("rejects the same variant listed twice before reaching the database", () => {
    const duplicate = { attribute: "Brand", value: "Odoo", extraPricePaise: 1 };
    const result = setupSchema.safeParse(setup({ variants: [duplicate, { ...duplicate, value: "odoo" }] }));
    expect(result.error?.issues[0].message).toContain("listed twice");
  });
});

describe("plans", () => {
  it("saves every option so billing can read it", async () => {
    const input = planSchema.parse({ name: "Fixed", pricePaise: 100000, frequency: "weekly", minQuantity: 5, availableFrom: "2026-11-01", availableTo: "2026-12-31", autoClose: true, canCloseEarly: false, canPause: false, canRenew: false });
    await createPlan(db, input, ACTOR);
    expect((await listPlans(db, { page: 1 })).rows[0]).toMatchObject(input);
  });
});

describe("discounts", () => {
  const rule = { name: "10% off", kind: "percent" as const, value: 1000, scope: "product" as const, minPurchasePaise: 0, minQuantity: 10, startsOn: "2026-01-01", endsOn: "2026-12-31", usageLimit: null };

  it("a rule created here changes computeInvoice's result, and stops once it expires", async () => {
    const suite = await createProduct(db, product, ACTOR);
    await createDiscount(db, { ...rule, productIds: [suite.id] }, ACTOR);
    const discounts = await productDiscountRules(db);
    const lines = (quantity: number) => [{ productId: suite.id, description: "Suite", quantity, unitPricePaise: 100, taxes: [] }];

    expect(computeInvoice({ lines: lines(10), discounts, on: "2026-06-01" }).discountPaise).toBe(100);
    expect(computeInvoice({ lines: lines(9), discounts, on: "2026-06-01" }).discountPaise).toBe(0);
    expect(computeInvoice({ lines: lines(10), discounts, on: "2027-01-01" }).discountPaise).toBe(0);
  });

  it("refuses to delete a discount that's been used, and allows an unused one", async () => {
    const used = await createDiscount(db, { ...rule, scope: "subscription", productIds: [] }, ACTOR);
    await db.update(schema.discounts).set({ usageCount: 1 }).where(eq(schema.discounts.id, used.id));
    expect(await failureOf(deleteDiscount(db, used.id, ACTOR))).toBeInstanceOf(CatalogConflict);

    const unused = await createDiscount(db, { ...rule, scope: "subscription", productIds: [] }, ACTOR);
    expect(await deleteDiscount(db, unused.id, ACTOR)).not.toBeNull();
  });
});
