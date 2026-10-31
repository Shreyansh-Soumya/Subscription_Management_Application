import { z } from "zod";
import { db } from "@/db";
import { BankStatementError } from "@/lib/bank-matching";
import { importBankStatement } from "@/lib/bank-statements";
import { authorizeRoute } from "@/lib/permissions";

const MAX_CHARACTERS = 2_000_000;
const body = z.object({ csv: z.string().max(MAX_CHARACTERS, "This file is too large. Upload up to 2 MB.") });

export async function POST(request: Request) {
  const access = await authorizeRoute(["admin", "staff"]);
  if ("response" in access) return access.response;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Choose a CSV file." }, { status: 400 });
  }

  try {
    return Response.json(await importBankStatement(db, { csv: parsed.data.csv, actorId: access.user.id }));
  } catch (error) {
    if (error instanceof BankStatementError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
