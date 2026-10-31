import { z } from "zod";
import { db } from "@/db";
import { confirmBankMatch } from "@/lib/bank-statements";
import { PaymentError } from "@/lib/payments";
import { authorizeRoute } from "@/lib/permissions";

const input = z.object({ lineId: z.uuid(), invoiceId: z.uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorizeRoute(["admin", "staff"]);
  if ("response" in access) return access.response;

  const body = await request.json().catch(() => null);
  const parsed = input.safeParse({ lineId: (await params).id, invoiceId: body?.invoiceId });
  if (!parsed.success) return Response.json({ error: "Choose an invoice." }, { status: 400 });

  try {
    return Response.json(await confirmBankMatch(db, { ...parsed.data, actorId: access.user.id }));
  } catch (error) {
    if (error instanceof PaymentError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
