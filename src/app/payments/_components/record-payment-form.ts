import { isRealDate } from "@/lib/dates";
import { rupeesToPaise } from "@/lib/rupees";

/** Payment methods as offered by the record-payment form. */
export const PAYMENT_METHODS = ["bank_transfer", "upi", "card", "cash", "cheque"] as const;

export type PaymentMethodChoice = (typeof PAYMENT_METHODS)[number];

export type RecordPaymentFormValues = {
  invoiceNumber: string;
  method: PaymentMethodChoice;
  /** Rupee string as typed by the user — validated here, never rounded. */
  amount: string;
  paidOn: string;
  note?: string;
};

export type RecordPaymentApiPayload = {
  invoiceNumber: string;
  method: PaymentMethodChoice;
  amountPaise: number;
  paidOn: string;
  note?: string;
};

export type BuiltRecordPaymentPayload =
  | { ok: true; payload: RecordPaymentApiPayload }
  | { ok: false; field: "invoiceNumber" | "amount" | "paidOn" | "note"; message: string };

/**
 * Client-side pre-validation for the record-payment form. Mirrors the server
 * Zod contract without importing it: the API stays the single authority
 * (including the future-payment rule, which the business clock owns).
 */
export function buildRecordPaymentPayload(values: RecordPaymentFormValues): BuiltRecordPaymentPayload {
  const invoiceNumber = values.invoiceNumber.trim();
  if (!invoiceNumber) {
    return { ok: false, field: "invoiceNumber", message: "Enter the invoice number." };
  }
  if (invoiceNumber.length > 50) {
    return { ok: false, field: "invoiceNumber", message: "Invoice numbers are at most 50 characters." };
  }

  const amountPaise = rupeesToPaise(values.amount);
  if (amountPaise === null) {
    return {
      ok: false,
      field: "amount",
      message: "Enter a rupee amount with at most two decimals, e.g. 1,250.50.",
    };
  }

  const paidOn = values.paidOn.trim();
  if (!isRealDate(paidOn)) {
    return { ok: false, field: "paidOn", message: "Pick the payment date." };
  }

  const note = values.note?.trim();
  if (note && note.length > 500) {
    return { ok: false, field: "note", message: "Notes are at most 500 characters." };
  }
  return {
    ok: true,
    payload: {
      invoiceNumber,
      method: values.method,
      amountPaise,
      paidOn,
      ...(note ? { note } : {}),
    },
  };
}
