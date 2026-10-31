import { describe, expect, it } from "vitest";
import { rupeesToPaise } from "./rupees";

describe("rupeesToPaise", () => {
  it("converts plain rupee strings exactly", () => {
    expect(rupeesToPaise("1250")).toBe(125000);
    expect(rupeesToPaise("1250.50")).toBe(125050);
    expect(rupeesToPaise("1250.5")).toBe(125050);
    expect(rupeesToPaise("0.05")).toBe(5);
    expect(rupeesToPaise(" 12 ")).toBe(1200);
  });

  it("converts Indian-formatted amounts with an optional single ₹ prefix", () => {
    expect(rupeesToPaise("₹1,250.50")).toBe(125050);
    expect(rupeesToPaise("₹1,250.5")).toBe(125050);
    expect(rupeesToPaise("₹100")).toBe(10000);
    expect(rupeesToPaise("1,25,000")).toBe(12500000);
    expect(rupeesToPaise("12,34,567")).toBe(123456700);
    expect(rupeesToPaise("63,780.25")).toBe(6378025);
  });

  it("rejects malformed formatting instead of normalizing it", () => {
    expect(rupeesToPaise("1,2,3")).toBeNull(); // broken comma grouping
    expect(rupeesToPaise("12, 50")).toBeNull(); // whitespace after the separator
    expect(rupeesToPaise("1 2")).toBeNull(); // embedded whitespace
    expect(rupeesToPaise("₹₹100")).toBeNull(); // repeated currency symbol
    expect(rupeesToPaise("₹ 1,250")).toBeNull(); // whitespace after the symbol
    expect(rupeesToPaise("12,34")).toBeNull(); // final group shorter than three digits
    expect(rupeesToPaise("1,2500")).toBeNull(); // middle group not two digits
    expect(rupeesToPaise("125,000")).toBeNull(); // not Indian grouping (1,25,000 is)
  });

  it("rejects more than two decimal places instead of rounding", () => {
    expect(rupeesToPaise("10.555")).toBeNull();
    expect(rupeesToPaise("10.5501")).toBeNull();
  });

  it("rejects non-numeric, negative and empty input", () => {
    expect(rupeesToPaise("abc")).toBeNull();
    expect(rupeesToPaise("")).toBeNull();
    expect(rupeesToPaise("-5")).toBeNull();
    expect(rupeesToPaise("1.2.3")).toBeNull();
    expect(rupeesToPaise("1250.")).toBeNull();
    expect(rupeesToPaise(".50")).toBeNull();
  });

  it("stays within the safe integer range", () => {
    expect(rupeesToPaise("90071992547410.00")).toBeNull();
    expect(rupeesToPaise("90071992547409.90")).toBe(9007199254740990);
  });
});
