import { z } from "zod";
import { paymentMethodEnum } from "@/db/schema";
import { isRealDate } from "./dates";

/**
 * Request schema for POST /api/payments. The wire format mirrors
 * `RecordPaymentInput` from lib/payments (whole paise, India business date),
 * except that the invoice may be referenced by id or by number.
 */
export const recordPaymentRequest = z
  .object({
    invoiceId: z.uuid().optional(),
    invoiceNumber: z.string().trim().min(1).max(50).optional(),
    method: z.enum(paymentMethodEnum.enumValues),
    amountPaise: z
      .number()
      .int()
      .positive()
      .refine(Number.isSafeInteger, "Enter a whole paise amount."),
    paidOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
      .refine(isRealDate, "Not a real calendar date."),
    note: z.string().trim().max(500).optional(),
  })
  .refine((value) => (value.invoiceId != null) !== (value.invoiceNumber != null), {
    message: "Provide exactly one of invoiceId or invoiceNumber.",
  });

export type RecordPaymentRequest = z.infer<typeof recordPaymentRequest>;

/** The first issue message is what the API surfaces to the caller. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request.";
}
