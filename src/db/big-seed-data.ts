import { eq, sql } from "drizzle-orm";
import type { Db } from "./index";
import { appToday } from "../lib/clock";
import { computeInvoice } from "../lib/compute-invoice";
import { addDays, addPeriods } from "../lib/dates";
import * as schema from "./schema";

const {
  customers, discounts, invoiceLines, invoices, numberCounters, payments, plans, products,
  subscriptionDiscounts, subscriptionLineTaxes, subscriptionLines, subscriptions, taxRules,
} = schema;

export const BIG_SEED_COUNT = 5000;
const CUSTOMER_COUNT = 400;
const CHUNK = 500;
/** Few on purpose: the welcome credit only has 3 uses, so most of these show it running out. */
const SUBSCRIPTIONS_WITH_CREDIT = 20;

const FIRST = ["Asha", "Vikram", "Meera", "Rohan", "Isha", "Kabir", "Tara", "Dev", "Nisha", "Arjun"];
const LAST = ["Textiles", "Foods", "Motors", "Pharma", "Systems", "Traders", "Logistics", "Retail", "Labs", "Exports"];

/** Spreads the subscriptions so lists and totals look like a real business. */
export function bigSeedSpec(index: number) {
  const bucket = index % 100;
  const isYearly = bucket >= 85;
  return {
    number: `SUB-B${String(index + 1).padStart(5, "0")}`,
    customerIndex: index % CUSTOMER_COUNT,
    isYearly,
    // Yearly plans need at least 5 seats, and some monthly ones reach the 10+ seat discount.
    seats: isYearly ? 5 + (index % 8) : index % 8 === 0 ? 12 : (index % 6) + 1,
    // A few are paused, so the billing run has real skips to report.
    status: bucket < 2 ? ("paused" as const) : ("active" as const),
    // 85 of every 100 past invoices are paid, 10 are open and 5 are overdue.
    pastInvoice: bucket % 20 === 0 ? ("overdue" as const) : bucket % 10 === 1 ? ("open" as const) : ("paid" as const),
  };
}

async function insertInChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let start = 0; start < rows.length; start += CHUNK) await insert(rows.slice(start, start + CHUNK));
}

/**
 * Adds subscriptions to the normal seed data, all due for billing tomorrow, each with one past invoice.
 * Run it after the normal seed. It refuses to run twice, because the numbers would clash.
 */
export async function loadBigSeed(db: Db, count = BIG_SEED_COUNT): Promise<{ subscriptions: number; invoices: number; billingDate: string }> {
  const [existing] = await db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.number, bigSeedSpec(0).number));
  if (existing) throw new Error("The big seed is already loaded. Reset the data first.");

  const [monthly] = await db.select().from(plans).where(eq(plans.name, "Monthly"));
  const [yearly] = await db.select().from(plans).where(eq(plans.name, "Yearly"));
  const [product] = await db.select().from(products).where(eq(products.name, "Brightloop Suite"));
  const [gst] = await db.select().from(taxRules).where(eq(taxRules.name, "GST 18%"));
  if (!monthly || !yearly || !product || !gst) throw new Error("Run the normal seed first.");
  const [credit] = await db.select().from(discounts).where(eq(discounts.name, "₹500 welcome credit"));

  const today = await appToday(db);
  const billingDate = addDays(today, 1);
  const specs = Array.from({ length: count }, (_, index) => bigSeedSpec(index));

  const customerRows = await db
    .insert(customers)
    .values(
      Array.from({ length: CUSTOMER_COUNT }, (_, index) => {
        const name = `${FIRST[index % 10]} ${LAST[Math.floor(index / 10) % 10]} ${Math.floor(index / 100) + 1}`;
        return { name, email: `accounts${index + 1}@brightloop-customers.test` };
      }),
    )
    .returning({ id: customers.id });

  // Reserve a block of invoice numbers in one step, rather than one query for each invoice.
  const [counter] = await db
    .insert(numberCounters)
    .values({ prefix: "INV", lastValue: count })
    .onConflictDoUpdate({ target: numberCounters.prefix, set: { lastValue: sql`${numberCounters.lastValue} + ${count}` } })
    .returning({ lastValue: numberCounters.lastValue });
  const firstInvoiceNumber = counter.lastValue - count + 1;

  const subscriptionIds: string[] = [];
  await insertInChunks(specs, async (chunk) => {
    const rows = await db
      .insert(subscriptions)
      .values(
        chunk.map((spec) => {
          const frequency = spec.isYearly ? ("yearly" as const) : ("monthly" as const);
          return {
            number: spec.number,
            customerId: customerRows[spec.customerIndex].id,
            planId: spec.isYearly ? yearly.id : monthly.id,
            status: spec.status,
            startDate: addPeriods(billingDate, frequency, -1),
            nextBillingDate: billingDate,
            paymentTermsDays: 30,
          };
        }),
      )
      .returning({ id: subscriptions.id });
    subscriptionIds.push(...rows.map((row) => row.id));
  });

  const lineRows = specs.map((spec, index) => {
    const plan = spec.isYearly ? yearly : monthly;
    return { subscriptionId: subscriptionIds[index], productId: product.id, description: "Brightloop Suite seats", quantity: spec.seats, unitPricePaise: plan.pricePaise };
  });
  await insertInChunks(lineRows, async (chunk) => {
    const rows = await db.insert(subscriptionLines).values(chunk).returning({ id: subscriptionLines.id });
    await db.insert(subscriptionLineTaxes).values(rows.map((row) => ({ lineId: row.id, taxRuleId: gst.id })));
  });

  if (credit) {
    await db.insert(subscriptionDiscounts).values(
      subscriptionIds.slice(0, SUBSCRIPTIONS_WITH_CREDIT).map((subscriptionId) => ({ subscriptionId, discountId: credit.id })),
    );
  }

  const tax = { id: gst.id, name: gst.name, rateBps: gst.rateBps };
  const invoiceRows = specs.map((spec, index) => {
    const frequency = spec.isYearly ? ("yearly" as const) : ("monthly" as const);
    const periodStart = addPeriods(billingDate, frequency, -1);
    const line = lineRows[index];
    const computed = computeInvoice({
      lines: [{ productId: line.productId, description: line.description, quantity: line.quantity, unitPricePaise: line.unitPricePaise, taxes: [tax] }],
      discounts: [],
      on: periodStart,
    });
    const isPaid = spec.pastInvoice === "paid";
    return {
      number: `INV-${String(firstInvoiceNumber + index).padStart(5, "0")}`,
      subscriptionId: subscriptionIds[index],
      customerId: customerRows[spec.customerIndex].id,
      status: isPaid ? ("paid" as const) : ("confirmed" as const),
      periodStart,
      periodEnd: addDays(billingDate, -1),
      issueDate: periodStart,
      // An overdue invoice's date has passed, and an open one still has time left.
      dueDate: spec.pastInvoice === "overdue" ? addDays(today, -(5 + (index % 40))) : spec.pastInvoice === "open" ? addDays(today, 5 + (index % 20)) : addDays(periodStart, 30),
      subtotalPaise: computed.subtotalPaise,
      discountPaise: computed.discountPaise,
      taxPaise: computed.taxPaise,
      totalPaise: computed.totalPaise,
      paidPaise: isPaid ? computed.totalPaise : 0,
      breakdown: computed,
    };
  });

  await insertInChunks(invoiceRows, async (chunk) => {
    const rows = await db.insert(invoices).values(chunk).returning({ id: invoices.id, number: invoices.number });
    const idByNumber = new Map(rows.map((row) => [row.number, row.id]));
    await db.insert(invoiceLines).values(
      chunk.map((invoice) => {
        const line = invoice.breakdown.lines[0];
        return {
          invoiceId: idByNumber.get(invoice.number)!,
          productId: line.productId,
          description: line.description,
          quantity: line.quantity,
          unitPricePaise: line.unitPricePaise,
          subtotalPaise: line.subtotalPaise,
          discountPaise: line.discountPaise,
          taxPaise: line.taxPaise,
          totalPaise: line.totalPaise,
        };
      }),
    );
    const paid = chunk.filter((invoice) => invoice.status === "paid");
    if (paid.length > 0) {
      await db.insert(payments).values(
        paid.map((invoice, index) => ({
          invoiceId: idByNumber.get(invoice.number)!,
          method: index % 3 === 0 ? ("bank_transfer" as const) : ("upi" as const),
          amountPaise: invoice.totalPaise,
          paidOn: invoice.dueDate < today ? invoice.dueDate : today,
          note: "Seed payment",
        })),
      );
    }
  });

  return { subscriptions: count, invoices: count, billingDate };
}
