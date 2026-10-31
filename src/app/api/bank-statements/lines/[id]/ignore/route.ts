import { z } from "zod";
import { db } from "@/db";
import { ignoreBankLine } from "@/lib/bank-statements";
import { PaymentError } from "@/lib/payments";
import { authorizeRoute } from "@/lib/permissions";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorizeRoute(["admin", "staff"]);
  if ("response" in access) return access.response;

  const lineId = z.uuid().safeParse((await params).id);
  if (!lineId.success) return Response.json({ error: "Statement line not found." }, { status: 400 });

  try {
    await ignoreBankLine(db, { lineId: lineId.data });
    return Response.json({ ignored: true });
  } catch (error) {
    if (error instanceof PaymentError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
