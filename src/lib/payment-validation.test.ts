import { describe, expect, it } from "vitest";
import { firstIssueMessage, recordPaymentRequest } from "./payment-validation";

const base = {
  method: "upi",
  amountPaise: 40000,
  paidOn: "2026-10-31",
} as const;

const parse = (body: unknown) => recordPaymentRequest.safeParse(body);

describe("recordPaymentRequest", () => {
  it("accepts the invoiceId form", () => {
    const result = parse({ ...base, invoiceId: "0b8f6c1e-0f46-4a7e-9c1a-4f3b2d1e0a11", note: " Part payment " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.note).toBe("Part payment");
  });

  it("accepts the invoiceNumber form", () => {
    const result = parse({ ...base, invoiceNumber: "INV-000123" });
    expect(result.success).toBe(true);
  });

  it("accepts every payment method and an omitted note", () => {
    for (const method of ["bank_transfer", "upi", "card", "cash", "cheque"]) {
      expect(parse({ ...base, invoiceNumber: "INV-1", method }).success).toBe(true);
    }
  });

  it("rejects a body with both or neither invoice reference", () => {
    const both = parse({
      ...base,
      invoiceId: "0b8f6c1e-0f46-4a7e-9c1a-4f3b2d1e0a11",
      invoiceNumber: "INV-000123",
    });
    expect(both.success).toBe(false);
    if (!both.success) expect(firstIssueMessage(both.error)).toContain("exactly one");

    expect(parse({ ...base }).success).toBe(false);
  });

  it("rejects a malformed invoice reference", () => {
    expect(parse({ ...base, invoiceId: "not-a-uuid" }).success).toBe(false);
    expect(parse({ ...base, invoiceNumber: "" }).success).toBe(false);
  });

  it("rejects an unknown method", () => {
    expect(parse({ ...base, invoiceNumber: "INV-1", method: "paypal" }).success).toBe(false);
  });

  it("rejects zero, negative, fractional and unsafe amounts", () => {
    for (const amountPaise of [0, -1, 10.5, 9007199254740992]) {
      expect(parse({ ...base, invoiceNumber: "INV-1", amountPaise }).success).toBe(false);
    }
  });

  it("rejects a non-strict or non-real paidOn date", () => {
    expect(parse({ ...base, invoiceNumber: "INV-1", paidOn: "31/12/2026" }).success).toBe(false);
    expect(parse({ ...base, invoiceNumber: "INV-1", paidOn: "2026-02-31" }).success).toBe(false);
    expect(parse({ ...base, invoiceNumber: "INV-1", paidOn: "2026-2-3" }).success).toBe(false);
  });

  it("rejects an over-long note and surfaces the first issue only", () => {
    const result = parse({
      ...base,
      invoiceId: "not-a-uuid",
      invoiceNumber: "INV-1",
      note: "x".repeat(501),
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(typeof firstIssueMessage(result.error)).toBe("string");
  });
});
