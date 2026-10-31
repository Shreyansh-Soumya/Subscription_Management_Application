import { describe, expect, it } from "vitest";
import { type OpenInvoice, parseBankStatement, parseRupees, suggestMatches } from "./bank-matching";

describe("parseRupees", () => {
  it("reads Indian digit grouping and currency marks without rounding errors", () => {
    expect(parseRupees("1,23,456.78")).toBe(12345678);
    expect(parseRupees("₹500")).toBe(50000);
    expect(parseRupees("Rs. 19.99")).toBe(1999);
    expect(parseRupees("1180.1")).toBe(118010);
  });

  it("returns null for anything that isn't a clear amount", () => {
    for (const bad of ["", "abc", "12.345", "1.2.3", "-5", "1e5"]) expect(parseRupees(bad)).toBeNull();
  });
});

describe("parseBankStatement", () => {
  it("reads credits from separate debit and credit columns, skipping debits", () => {
    const csv = "Date,Narration,Ref No,Debit,Credit\n31/10/2026,UPI INV-00001 Rao Traders,UTR1,,\"1,180.00\"\n31/10/2026,Rent,UTR2,500.00,\n";
    const result = parseBankStatement(csv);
    expect(result.lines).toEqual([
      { lineNumber: 2, date: "2026-10-31", description: "UPI INV-00001 Rao Traders", reference: "UTR1", amountPaise: 118000 },
    ]);
    expect(result.debitsSkipped).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it("reads a single amount column, treating negatives as debits", () => {
    const result = parseBankStatement("Transaction Date,Description,Amount\n2026-10-30,Payment,250.50\n2026-10-30,Fee,-10.00\n");
    expect(result.lines.map((line) => line.amountPaise)).toEqual([25050]);
    expect(result.debitsSkipped).toBe(1);
  });

  it("handles a byte order mark, Windows line endings, quotes and blank lines", () => {
    const result = parseBankStatement('﻿Date,Particulars,Deposit\r\n01-02-2026,"Acme, ""Ltd""",100\r\n\r\n');
    expect(result.lines[0]).toMatchObject({ date: "2026-02-01", description: 'Acme, "Ltd"', amountPaise: 10000 });
  });

  it("reads dates written with a month name", () => {
    expect(parseBankStatement("Date,Details,Credit\n05-Mar-2026,X,1\n").lines[0].date).toBe("2026-03-05");
  });

  it("reports a bad row with its line number and keeps the good ones", () => {
    const result = parseBankStatement("Date,Details,Credit\n31/02/2026,Bad date,100\n31/10/2026,Bad amount,abc\n31/10/2026,Good,100\n");
    expect(result.errors).toEqual([
      { lineNumber: 2, message: "Date isn't valid: 31/02/2026" },
      { lineNumber: 3, message: "Amount isn't valid: abc" },
    ]);
    expect(result.lines).toHaveLength(1);
  });

  it("explains when required columns are missing", () => {
    expect(() => parseBankStatement("Foo,Bar\n1,2\n")).toThrow("needs a date column");
    expect(() => parseBankStatement("Date,Foo\n1,2\n")).toThrow("needs a credit or amount column");
    expect(() => parseBankStatement("")).toThrow("empty");
  });

  it("refuses a file with too many rows", () => {
    const rows = Array.from({ length: 5001 }, () => "2026-10-30,X,1").join("\n");
    expect(() => parseBankStatement(`Date,Details,Credit\n${rows}`)).toThrow("5,000");
  });
});

const invoice = (overrides: Partial<OpenInvoice> = {}): OpenInvoice => ({
  id: "i1", number: "INV-00042", customerName: "Rao Traders", balancePaise: 118000, ...overrides,
});
const line = (overrides = {}) => ({ lineNumber: 2, date: "2026-10-31", description: "NEFT credit", reference: "", amountPaise: 118000, ...overrides });

describe("suggestMatches", () => {
  it("is sure when the invoice number and full amount both match", () => {
    const [match] = suggestMatches([line({ description: "UPI inv 00042 thanks" })], [invoice()]);
    expect(match).toMatchObject({ invoiceId: "i1", confidence: "high", reason: "Invoice number and amount match" });
  });

  it("finds the invoice number in the reference column", () => {
    expect(suggestMatches([line({ reference: "INV00042" })], [invoice()])[0].confidence).toBe("high");
  });

  it("doesn't mistake one invoice number for a longer one", () => {
    const [match] = suggestMatches([line({ description: "INV-000421", amountPaise: 5 })], [invoice()]);
    expect(match.invoiceId).toBeNull();
  });

  it("suggests a part payment when the number matches and the amount is lower", () => {
    const [match] = suggestMatches([line({ description: "INV-00042", amountPaise: 50000 })], [invoice()]);
    expect(match).toMatchObject({ invoiceId: "i1", confidence: "medium", reason: "Invoice number matches, part payment" });
  });

  it("won't suggest more than the invoice's balance", () => {
    const [match] = suggestMatches([line({ description: "INV-00042", amountPaise: 118001 })], [invoice()]);
    expect(match).toMatchObject({ invoiceId: null, reason: "INV-00042 only has ₹1,180.00 left to pay" });
  });

  it("is sure when the customer's name and full amount match", () => {
    const [match] = suggestMatches([line({ description: "NEFT RAO TRADERS PVT" })], [invoice(), invoice({ id: "i2", number: "INV-2", customerName: "Other" })]);
    expect(match).toMatchObject({ invoiceId: "i1", confidence: "high", reason: "Customer name and amount match" });
  });

  it("is unsure when only a unique amount matches", () => {
    expect(suggestMatches([line()], [invoice()])[0]).toMatchObject({ invoiceId: "i1", confidence: "medium", reason: "Only this invoice has this amount" });
  });

  it("makes no choice when several invoices share the amount, and lists them", () => {
    const [match] = suggestMatches([line()], [invoice(), invoice({ id: "i2", number: "INV-00043", customerName: "Other" })]);
    expect(match.invoiceId).toBeNull();
    expect(match.alternatives).toEqual(["i1", "i2"]);
  });

  it("finds nothing when no amount or number matches", () => {
    expect(suggestMatches([line({ amountPaise: 1 })], [invoice()])[0]).toMatchObject({ invoiceId: null, confidence: null, reason: "No matching invoice" });
  });

  it("doesn't suggest the same balance twice for two identical payments", () => {
    const matches = suggestMatches([line({ description: "INV-00042" }), line({ lineNumber: 3, description: "INV-00042" })], [invoice()]);
    expect(matches[0].invoiceId).toBe("i1");
    expect(matches[1].invoiceId).toBeNull();
  });
});
