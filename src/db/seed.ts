import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { appToday, setClockOffset } from "../lib/clock";
import { computeInvoice, type DiscountRule } from "../lib/compute-invoice";
import { addDays, addPeriods } from "../lib/dates";
import { nextNumber } from "../lib/numbers";
import * as schema from "./schema";
import { seedPassword } from "./seed-password";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
const loginPassword = seedPassword(url, process.env.SEED_PASSWORD);
const client = postgres(url, { max: 1, prepare: false });
const db = drizzle({ client, schema });
const {
  account, customers, discounts, discountProducts, events, invoiceLines, invoices, payments, plans,
  productTaxes, productVariants, products, quotationTemplateLines, quotationTemplates,
  subscriptionDiscounts, subscriptionLineTaxes, subscriptionLines, subscriptions, taxRules, user,
} = schema;


async function addLogin(name: string, email: string, role: "admin" | "staff" | "customer", password: string) {
  const id = randomUUID();
  await db.insert(user).values({ id, name, email, role, emailVerified: true });
  await db.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password });
  return id;
}

async function main() {
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, "admin@brightloop.test"));
  if (existing) {
    console.log("Seed data is already there, so nothing changed.");
    return;
  }

  await setClockOffset(db, 0);
  const today = await appToday(db);
  const password = await hashPassword(loginPassword);

  const adminId = await addLogin("Asha Admin", "admin@brightloop.test", "admin", password);
  await addLogin("Sam Staff", "staff@brightloop.test", "staff", password);
  const customerUserId = await addLogin("Priya Rao", "customer@brightloop.test", "customer", password);

  const customerRows = await db
    .insert(customers)
    .values([
      { userId: customerUserId, name: "Rao Traders", email: "customer@brightloop.test", phone: "+91 90000 00001" },
      { name: "Northwind Retail", email: "accounts@northwind.test", phone: "+91 90000 00002" },
      { name: "Meridian Logistics", email: "finance@meridian.test", phone: "+91 90000 00003" },
    ])
    .returning();

  const [gst] = await db.insert(taxRules).values({ name: "GST 18%", rateBps: 1800 }).returning();
  const tax = { id: gst.id, name: gst.name, rateBps: gst.rateBps };

  const [suite, support] = await db
    .insert(products)
    .values([
      { name: "Brightloop Suite", type: "Software", salesPricePaise: 120000, costPricePaise: 30000, notes: "Priced per seat" },
      { name: "Priority Support", type: "Service", salesPricePaise: 50000, costPricePaise: 20000, isAddon: true },
    ])
    .returning();
  await db.insert(productTaxes).values([
    { productId: suite.id, taxRuleId: gst.id },
    { productId: support.id, taxRuleId: gst.id },
  ]);
  const [, odooVariant] = await db
    .insert(productVariants)
    .values([
      { productId: suite.id, attribute: "Brand", value: "Brightloop", extraPricePaise: 0 },
      { productId: suite.id, attribute: "Brand", value: "Odoo", extraPricePaise: 56000 },
    ])
    .returning();

  const [monthly, yearly, fixedTerm] = await db
    .insert(plans)
    .values([
      { name: "Monthly", pricePaise: 120000, frequency: "monthly" as const, minQuantity: 1 },
      { name: "Yearly", pricePaise: 1200000, frequency: "yearly" as const, minQuantity: 5, canPause: false },
      { name: "Fixed 3 months", pricePaise: 100000, frequency: "monthly" as const, autoClose: true, canCloseEarly: false, canRenew: false },
    ])
    .returning();

  const [template] = await db
    .insert(quotationTemplates)
    .values({ name: "Large customer, yearly", planId: yearly.id, validityDays: 15 })
    .returning();
  await db.insert(quotationTemplateLines).values([
    { templateId: template.id, productId: suite.id, variantId: odooVariant.id, quantity: 25 },
    { templateId: template.id, productId: support.id, quantity: 1 },
  ]);

  const [seatDiscount, wholeDiscount] = await db
    .insert(discounts)
    .values([
      { name: "10% off 10+ seats", kind: "percent" as const, value: 1000, scope: "product" as const, minQuantity: 10, startsOn: addDays(today, -30), endsOn: addDays(today, 60) },
      { name: "₹500 welcome credit", kind: "fixed" as const, value: 50000, scope: "subscription" as const, startsOn: addDays(today, -30), endsOn: addDays(today, 20), usageLimit: 3 },
    ])
    .returning();
  await db.insert(discountProducts).values({ discountId: seatDiscount.id, productId: suite.id });

  const seatRule: DiscountRule = {
    id: seatDiscount.id, name: seatDiscount.name, kind: "percent", value: seatDiscount.value, scope: "product",
    productIds: [suite.id], minPurchasePaise: 0, minQuantity: 10, startsOn: seatDiscount.startsOn, endsOn: seatDiscount.endsOn,
    usageLimit: null, usageCount: 0,
  };

  // One subscription in every status, spread across customers and plans.
  const specs = [
    { status: "draft", plan: monthly, seats: 3, startOffset: 0 },
    { status: "quotation", plan: yearly, seats: 25, startOffset: 3 },
    { status: "confirmed", plan: monthly, seats: 5, startOffset: 1 },
    { status: "active", plan: monthly, seats: 12, startOffset: -40, invoice: "overdue" },
    { status: "active", plan: monthly, seats: 4, startOffset: -30, invoice: "paid" },
    { status: "active", plan: yearly, seats: 20, startOffset: -10, invoice: "draft" },
    { status: "active", plan: fixedTerm, seats: 2, startOffset: -80, expiresIn: 10, invoice: "part-paid" },
    { status: "paused", plan: monthly, seats: 2, startOffset: -60 },
    { status: "closed", plan: fixedTerm, seats: 1, startOffset: -200, expiresIn: -110 },
  ] as const;

  for (const [index, spec] of specs.entries()) {
    const customer = customerRows[index % customerRows.length];
    const startDate = addDays(today, spec.startOffset);
    const expiresIn = "expiresIn" in spec ? spec.expiresIn : undefined;
    const lines = [
      { productId: suite.id, description: "Brightloop Suite seats", quantity: spec.seats, unitPricePaise: spec.plan.pricePaise, taxes: [tax] },
    ];

    const isRunning = spec.status === "active" || spec.status === "paused";
    const [subscription] = await db
      .insert(subscriptions)
      .values({
        number: await nextNumber(db, "SUB"),
        customerId: customer.id,
        planId: spec.plan.id,
        templateId: spec.status === "quotation" ? template.id : null,
        status: spec.status,
        startDate,
        expiryDate: expiresIn !== undefined ? addDays(today, expiresIn) : addPeriods(startDate, "yearly", 1),
        quoteValidUntil: spec.status === "quotation" ? addDays(today, template.validityDays) : null,
        nextBillingDate: isRunning ? addPeriods(startDate, spec.plan.frequency, 1) : null,
      })
      .returning();

    const [line] = await db
      .insert(subscriptionLines)
      .values({ subscriptionId: subscription.id, ...lines[0] })
      .returning();
    await db.insert(subscriptionLineTaxes).values({ lineId: line.id, taxRuleId: gst.id });
    await db.insert(events).values({
      entityType: "subscription", entityId: subscription.id, type: "status_changed",
      toStatus: spec.status, note: "Created by seed data", actorId: adminId, occurredAt: new Date(`${startDate}T04:30:00Z`),
    });

    if (spec.status === "active" && index === 3) {
      await db.insert(subscriptionDiscounts).values({ subscriptionId: subscription.id, discountId: wholeDiscount.id });
    }
    if (!("invoice" in spec)) continue;

    const result = computeInvoice({ lines, discounts: [seatRule], on: startDate });
    const dueDate = spec.invoice === "overdue" ? addDays(today, -10) : addDays(today, 20);
    const status = spec.invoice === "draft" ? "draft" : spec.invoice === "paid" ? "paid" : "confirmed";
    const paidPaise = spec.invoice === "paid" ? result.totalPaise : spec.invoice === "part-paid" ? Math.floor(result.totalPaise / 2) : 0;

    const [invoice] = await db
      .insert(invoices)
      .values({
        number: await nextNumber(db, "INV"),
        subscriptionId: subscription.id,
        customerId: customer.id,
        status,
        periodStart: startDate,
        periodEnd: addDays(addPeriods(startDate, spec.plan.frequency, 1), -1),
        issueDate: startDate,
        dueDate,
        subtotalPaise: result.subtotalPaise,
        discountPaise: result.discountPaise,
        taxPaise: result.taxPaise,
        totalPaise: result.totalPaise,
        paidPaise,
        breakdown: result,
      })
      .returning();
    await db.insert(invoiceLines).values(
      result.lines.map((computed) => ({
        invoiceId: invoice.id,
        productId: computed.productId,
        description: computed.description,
        quantity: computed.quantity,
        unitPricePaise: computed.unitPricePaise,
        subtotalPaise: computed.subtotalPaise,
        discountPaise: computed.discountPaise,
        taxPaise: computed.taxPaise,
        totalPaise: computed.totalPaise,
      })),
    );
    if (paidPaise > 0) {
      await db.insert(payments).values({
        invoiceId: invoice.id, method: "upi", amountPaise: paidPaise, paidOn: addDays(startDate, 2), note: "Seed payment", recordedBy: adminId,
      });
    }
  }

  console.log(`Seeded ${specs.length} subscriptions. Log in as admin@, staff@ or customer@brightloop.test`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.end());
