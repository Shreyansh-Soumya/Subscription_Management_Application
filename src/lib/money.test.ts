import { describe, expect, it } from "vitest";
import { allocate, formatMoney, percentOf } from "./money";

describe("percentOf", () => {
  it("takes a percentage given in basis points", () => {
    expect(percentOf(10000, 1800)).toBe(1800);
  });

  it("rounds half a paisa up", () => {
    expect(percentOf(50, 100)).toBe(1); // 0.5 paise
    expect(percentOf(49, 100)).toBe(0); // 0.49 paise
  });
});

describe("allocate", () => {
  it("splits an amount in proportion to weights", () => {
    expect(allocate(300, [100, 200])).toEqual([100, 200]);
  });

  it("never loses or invents a paisa when the split is uneven", () => {
    const parts = allocate(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
  });

  it("gives nothing to anyone when all weights are zero", () => {
    expect(allocate(100, [0, 0])).toEqual([0, 0]);
  });
});

describe("formatMoney", () => {
  it("shows paise as rupees with Indian digit grouping", () => {
    expect(formatMoney(12345678)).toBe("₹1,23,456.78");
  });
});
