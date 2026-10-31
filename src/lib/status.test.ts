import { describe, expect, it } from "vitest";
import { checkInvoiceTransition, checkSubscriptionTransition } from "./status";

const plan = { canPause: true, canCloseEarly: true, canRenew: true };
const today = "2026-10-31";
const base = { plan, today, quoteValidUntil: null, expiryDate: "2027-10-31" };

describe("checkSubscriptionTransition", () => {
  it("allows each step of the main flow", () => {
    expect(checkSubscriptionTransition("draft", "quotation", base)).toEqual({ ok: true });
    expect(checkSubscriptionTransition("quotation", "confirmed", base)).toEqual({ ok: true });
    expect(checkSubscriptionTransition("confirmed", "active", base)).toEqual({ ok: true });
    expect(checkSubscriptionTransition("active", "closed", base)).toEqual({ ok: true });
  });

  it("rejects skipping a step", () => {
    const result = checkSubscriptionTransition("draft", "active", base);
    expect(result).toEqual({ ok: false, reason: "A draft subscription can't become active." });
  });

  it("rejects reopening a closed subscription", () => {
    expect(checkSubscriptionTransition("closed", "active", base).ok).toBe(false);
  });

  it("rejects confirming a quotation after it expires", () => {
    const result = checkSubscriptionTransition("quotation", "confirmed", {
      ...base,
      quoteValidUntil: "2026-10-30",
    });
    expect(result).toEqual({ ok: false, reason: "This quotation expired on 2026-10-30." });
  });

  it("allows confirming a quotation on its last valid day", () => {
    const result = checkSubscriptionTransition("quotation", "confirmed", {
      ...base,
      quoteValidUntil: today,
    });
    expect(result.ok).toBe(true);
  });

  it("allows pausing and resuming only when the plan permits pausing", () => {
    expect(checkSubscriptionTransition("active", "paused", base).ok).toBe(true);
    expect(checkSubscriptionTransition("paused", "active", base).ok).toBe(true);
    const noPause = { ...base, plan: { ...plan, canPause: false } };
    expect(checkSubscriptionTransition("active", "paused", noPause)).toEqual({
      ok: false,
      reason: "This plan doesn't allow pausing.",
    });
  });

  it("blocks closing before expiry when the plan forbids early close", () => {
    const noEarlyClose = { ...base, plan: { ...plan, canCloseEarly: false } };
    expect(checkSubscriptionTransition("active", "closed", noEarlyClose)).toEqual({
      ok: false,
      reason: "This plan can't be closed before its expiry date.",
    });
  });

  it("allows closing on expiry even when the plan forbids early close", () => {
    const atExpiry = {
      ...base,
      expiryDate: today,
      plan: { ...plan, canCloseEarly: false },
    };
    expect(checkSubscriptionTransition("active", "closed", atExpiry).ok).toBe(true);
  });
});

describe("checkInvoiceTransition", () => {
  it("allows draft to confirmed to paid", () => {
    expect(checkInvoiceTransition("draft", "confirmed").ok).toBe(true);
    expect(checkInvoiceTransition("confirmed", "paid").ok).toBe(true);
  });

  it("allows cancelling before payment", () => {
    expect(checkInvoiceTransition("draft", "cancelled").ok).toBe(true);
    expect(checkInvoiceTransition("confirmed", "cancelled").ok).toBe(true);
  });

  it("rejects cancelling a paid invoice", () => {
    expect(checkInvoiceTransition("paid", "cancelled")).toEqual({
      ok: false,
      reason: "A paid invoice can't become cancelled.",
    });
  });

  it("rejects paying a draft directly", () => {
    expect(checkInvoiceTransition("draft", "paid").ok).toBe(false);
  });
});
