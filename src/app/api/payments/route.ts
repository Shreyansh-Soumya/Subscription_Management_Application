import { db } from "@/db";
import { resolveInvoiceRef } from "@/lib/invoice-queries";
import { firstIssueMessage, recordPaymentRequest } from "@/lib/payment-validation";
import { PaymentError, recordPayment } from "@/lib/payments";
import { authorizeRoute } from "@/lib/permissions";
import { TransitionError } from "@/lib/transition";

export async function POST(request: Request) {
  const access = await authorizeRoute(["admin", "staff"]);
  if ("response" in access) return access.response;

  const parsed = recordPaymentRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const invoice = await resolveInvoiceRef(db, {
    invoiceId: parsed.data.invoiceId,
    invoiceNumber: parsed.data.invoiceNumber,
  });
  if (!invoice) {
    return Response.json({ error: "Invoice not found." }, { status: 404 });
  }

  try {
    const result = await recordPayment(db, {
      invoiceId: invoice.id,
      method: parsed.data.method,
      amountPaise: parsed.data.amountPaise,
      paidOn: parsed.data.paidOn,
      note: parsed.data.note,
      actorId: access.user.id,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof PaymentError || error instanceof TransitionError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
