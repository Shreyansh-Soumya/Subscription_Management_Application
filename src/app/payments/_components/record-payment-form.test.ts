import { describe, expect, it } from "vitest";
import { buildRecordPaymentPayload } from "./record-payment-form";

const base = {
  invoiceNumber: "INV-000123",
  method: "upi",
  amount: "1,250.50",
  paidOn: "2026-10-31",
} as const;

describe("buildRecordPaymentPayload", () => {
  it("builds the API payload with the amount in paise", () => {
    const result = buildRecordPaymentPayload({ ...base, note: " Part payment " });
    expect(result).toEqual({
      ok: true,
      payload: {
        invoiceNumber: "INV-000123",
        method: "upi",
        amountPaise: 125050,
        paidOn: "2026-10-31",
        note: "Part payment",
      },
    });
  });

  it("omits the note when it is blank", () => {
    const result = buildRecordPaymentPayload({ ...base, note: "   " });
    expect(result).toEqual({
      ok: true,
      payload: { invoiceNumber: "INV-000123", method: "upi", amountPaise: 125050, paidOn: "2026-10-31" },
    });
  });

  it("requires an invoice number within the server's length bound", () => {
    expect(buildRecordPaymentPayload({ ...base, invoiceNumber: "   " })).toEqual({
      ok: false,
      field: "invoiceNumber",
      message: "Enter the invoice number.",
    });
    expect(buildRecordPaymentPayload({ ...base, invoiceNumber: "I".repeat(51) })).toMatchObject({
      ok: false,
      field: "invoiceNumber",
    });
  });

  it("rejects rupee amounts the strict parser refuses, without rounding", () => {
    for (const amount of ["10.555", "abc", "", "-5", "1,2,3", "12, 50", "₹₹100"]) {
      expect(buildRecordPaymentPayload({ ...base, amount })).toMatchObject({
        ok: false,
        field: "amount",
      });
    }
  });

  it("rejects a non-real payment date", () => {
    expect(buildRecordPaymentPayload({ ...base, paidOn: "2026-02-31" })).toEqual({
      ok: false,
      field: "paidOn",
      message: "Pick the payment date.",
    });
    expect(buildRecordPaymentPayload({ ...base, paidOn: "31/12/2026" }).ok).toBe(false);
  });

  it("rejects a 501-character note after trimming", () => {
    const result = buildRecordPaymentPayload({ ...base, note: ` ${"x".repeat(501)} ` });
    expect(result).toEqual({ ok: false, field: "note", message: "Notes are at most 500 characters." });
  });

  it("accepts a note that trims to exactly 500 characters", () => {
    const note = ` ${"x".repeat(500)} `;
    const result = buildRecordPaymentPayload({ ...base, note });
    expect(result).toMatchObject({ ok: true, payload: { note: "x".repeat(500) } });
  });

  it("passes the chosen method through", () => {
    for (const method of ["bank_transfer", "card", "cash", "cheque"] as const) {
      const result = buildRecordPaymentPayload({ ...base, method });
      expect(result).toMatchObject({ ok: true, payload: { method } });
    }
  });
});
