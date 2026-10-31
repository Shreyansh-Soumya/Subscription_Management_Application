export type SubscriptionStatus = "draft" | "quotation" | "confirmed" | "active" | "paused" | "closed";
export type InvoiceStatus = "draft" | "confirmed" | "paid" | "cancelled";
export type TransitionCheck = { ok: true } | { ok: false; reason: string };

export const SUBSCRIPTION_NEXT: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  draft: ["quotation"],
  quotation: ["confirmed"],
  confirmed: ["active"],
  active: ["paused", "closed"],
  paused: ["active", "closed"],
  closed: [],
};

export const INVOICE_NEXT: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

const OK: TransitionCheck = { ok: true };
const fail = (reason: string): TransitionCheck => ({ ok: false, reason });

function article(word: string): string {
  return /^[aeiou]/.test(word) ? "An" : "A";
}

export type SubscriptionRules = {
  plan: { canPause: boolean; canCloseEarly: boolean };
  today: string;
  quoteValidUntil: string | null;
  expiryDate: string | null;
};

export function checkSubscriptionTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
  rules: SubscriptionRules,
): TransitionCheck {
  if (!SUBSCRIPTION_NEXT[from].includes(to)) {
    return fail(`${article(from)} ${from} subscription can't become ${to}.`);
  }
  if (from === "quotation" && rules.quoteValidUntil && rules.today > rules.quoteValidUntil) {
    return fail(`This quotation expired on ${rules.quoteValidUntil}.`);
  }
  if (to === "paused" && !rules.plan.canPause) {
    return fail("This plan doesn't allow pausing.");
  }
  if (to === "closed" && !rules.plan.canCloseEarly) {
    const reachedExpiry = rules.expiryDate !== null && rules.today >= rules.expiryDate;
    if (!reachedExpiry) return fail("This plan can't be closed before its expiry date.");
  }
  return OK;
}

export function checkInvoiceTransition(from: InvoiceStatus, to: InvoiceStatus): TransitionCheck {
  if (!INVOICE_NEXT[from].includes(to)) {
    return fail(`${article(from)} ${from} invoice can't become ${to}.`);
  }
  return OK;
}
