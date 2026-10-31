import { describe, expect, it } from "vitest";
import { computeInvoice, type DiscountRule, type InvoiceLineInput } from "./compute-invoice";

const gst18 = { id: "gst18", name: "GST 18%", rateBps: 1800 };
const seats: InvoiceLineInput = {
  productId: "seats",
  description: "Seats",
  quantity: 10,
  unitPricePaise: 10000,
  taxes: [gst18],
};
const addon: InvoiceLineInput = {
  productId: "addon",
  description: "Add-on",
  quantity: 1,
  unitPricePaise: 50000,
  taxes: [],
};
const percent10: DiscountRule = {
  id: "d1",
  name: "10% off",
  kind: "percent",
  value: 1000,
  scope: "subscription",
  productIds: [],
  minPurchasePaise: 0,
  minQuantity: 0,
  startsOn: "2026-01-01",
  endsOn: "2026-12-31",
  usageLimit: null,
  usageCount: 0,
};
const on = "2026-10-31";

describe("computeInvoice totals", () => {
  it("multiplies quantity by unit price and adds tax", () => {
    const result = computeInvoice({ lines: [seats], discounts: [], on });
    expect(result.subtotalPaise).toBe(100000);
    expect(result.taxPaise).toBe(18000);
    expect(result.totalPaise).toBe(118000);
  });

  it("applies several taxes to one line and lists each one", () => {
    const line = { ...seats, taxes: [{ id: "cgst", name: "CGST", rateBps: 900 }, { id: "sgst", name: "SGST", rateBps: 900 }] };
    const result = computeInvoice({ lines: [line], discounts: [], on });
    expect(result.taxPaise).toBe(18000);
    expect(result.taxes).toEqual([
      { id: "cgst", name: "CGST", rateBps: 900, amountPaise: 9000 },
      { id: "sgst", name: "SGST", rateBps: 900, amountPaise: 9000 },
    ]);
  });

  it("returns an all-zero invoice when there are no lines", () => {
    const result = computeInvoice({ lines: [], discounts: [], on });
    expect(result.totalPaise).toBe(0);
  });
});

describe("computeInvoice discounts", () => {
  it("takes a percentage off before tax", () => {
    const result = computeInvoice({ lines: [seats], discounts: [percent10], on });
    expect(result.discountPaise).toBe(10000);
    expect(result.taxPaise).toBe(16200);
    expect(result.totalPaise).toBe(106200);
  });

  it("takes a fixed amount off", () => {
    const fixed = { ...percent10, kind: "fixed" as const, value: 25000 };
    const result = computeInvoice({ lines: [seats], discounts: [fixed], on });
    expect(result.discountPaise).toBe(25000);
    expect(result.totalPaise).toBe(88500);
  });

  it("never discounts below zero", () => {
    const huge = { ...percent10, kind: "fixed" as const, value: 99999999 };
    const result = computeInvoice({ lines: [seats], discounts: [huge], on });
    expect(result.discountPaise).toBe(100000);
    expect(result.totalPaise).toBe(0);
  });

  it("limits a product discount to that product's lines", () => {
    const productOnly = { ...percent10, scope: "product" as const, productIds: ["seats"] };
    const result = computeInvoice({ lines: [seats, addon], discounts: [productOnly], on });
    expect(result.lines[0].discountPaise).toBe(10000);
    expect(result.lines[1].discountPaise).toBe(0);
  });

  it("spreads a fixed subscription discount across lines without losing a paisa", () => {
    const fixed = { ...percent10, kind: "fixed" as const, value: 10001 };
    const result = computeInvoice({ lines: [seats, addon], discounts: [fixed], on });
    const lineTotal = result.lines.reduce((sum, line) => sum + line.discountPaise, 0);
    expect(lineTotal).toBe(10001);
  });

  it("applies on its first and last day, but not outside those dates", () => {
    const applied = (date: string) =>
      computeInvoice({ lines: [seats], discounts: [percent10], on: date }).appliedDiscounts.length;
    expect(applied("2026-01-01")).toBe(1);
    expect(applied("2026-12-31")).toBe(1);
    expect(applied("2025-12-31")).toBe(0);
    expect(applied("2027-01-01")).toBe(0);
  });

  it("stops once the usage limit is reached", () => {
    const usedUp = { ...percent10, usageLimit: 3, usageCount: 3 };
    const result = computeInvoice({ lines: [seats], discounts: [usedUp], on });
    expect(result.discountPaise).toBe(0);
    expect(result.skippedDiscounts).toEqual([{ id: "d1", name: "10% off", reason: "Usage limit reached" }]);
  });

  it("requires the minimum purchase", () => {
    const min = { ...percent10, minPurchasePaise: 100001 };
    expect(computeInvoice({ lines: [seats], discounts: [min], on }).discountPaise).toBe(0);
    const exact = { ...percent10, minPurchasePaise: 100000 };
    expect(computeInvoice({ lines: [seats], discounts: [exact], on }).discountPaise).toBe(10000);
  });

  it("requires the minimum quantity", () => {
    const min = { ...percent10, minQuantity: 11 };
    expect(computeInvoice({ lines: [seats], discounts: [min], on }).discountPaise).toBe(0);
    const exact = { ...percent10, minQuantity: 10 };
    expect(computeInvoice({ lines: [seats], discounts: [exact], on }).discountPaise).toBe(10000);
  });

  it("applies product discounts before subscription discounts", () => {
    const productFixed = { ...percent10, id: "d2", kind: "fixed" as const, value: 50000, scope: "product" as const, productIds: ["seats"] };
    const result = computeInvoice({ lines: [seats], discounts: [percent10, productFixed], on });
    // 1000.00 - 500.00 product discount, then 10% of the remaining 500.00.
    expect(result.discountPaise).toBe(55000);
    expect(result.appliedDiscounts.map((d) => [d.id, d.amountPaise])).toEqual([
      ["d2", 50000],
      ["d1", 5000],
    ]);
  });
});
