import { describe, expect, it } from "vitest";
import { parseInvoiceView, parsePageNumber, parseSearchQuery } from "./params";

describe("parseInvoiceView", () => {
  it("accepts the three known views", () => {
    expect(parseInvoiceView("outstanding")).toBe("outstanding");
    expect(parseInvoiceView("overdue")).toBe("overdue");
    expect(parseInvoiceView("paid")).toBe("paid");
  });

  it("falls back to outstanding for unknown values", () => {
    expect(parseInvoiceView("bogus")).toBe("outstanding");
    expect(parseInvoiceView("OVERDUE")).toBe("outstanding");
    expect(parseInvoiceView("")).toBe("outstanding");
    expect(parseInvoiceView(undefined)).toBe("outstanding");
  });
});

describe("parseSearchQuery", () => {
  it("trims and keeps a bounded query", () => {
    expect(parseSearchQuery("  Rao  ")).toBe("Rao");
    expect(parseSearchQuery("x".repeat(150))).toHaveLength(100);
  });

  it("returns undefined for blank queries", () => {
    expect(parseSearchQuery("   ")).toBeUndefined();
    expect(parseSearchQuery(undefined)).toBeUndefined();
  });
});

describe("parsePageNumber", () => {
  it("accepts positive integer page strings", () => {
    expect(parsePageNumber(undefined)).toBe(1);
    expect(parsePageNumber("1")).toBe(1);
    expect(parsePageNumber(" 3 ")).toBe(3);
  });

  it("falls back to page 1 for invalid values", () => {
    expect(parsePageNumber("abc")).toBe(1);
    expect(parsePageNumber("-2")).toBe(1);
    expect(parsePageNumber("0")).toBe(1);
    expect(parsePageNumber("2.9")).toBe(1);
    expect(parsePageNumber("99999999999999999999")).toBe(1);
    expect(parsePageNumber(undefined)).toBe(1);
  });
});
