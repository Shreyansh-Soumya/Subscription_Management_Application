import { z } from "zod";
import { db } from "@/db";
import { runBilling } from "@/lib/billing";
import { authorizeRoute } from "@/lib/permissions";

export const maxDuration = 60;

const BATCH_SIZE = 100;
const body = z.object({ cursor: z.uuid().optional() });

/** Handles one batch. The screen calls this repeatedly, passing back `cursor`, until `hasMore` is false. */
export async function POST(request: Request) {
  const access = await authorizeRoute(["admin", "staff"]);
  if ("response" in access) return access.response;

  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "This request isn't valid." }, { status: 400 });

  return Response.json(await runBilling(db, { limit: BATCH_SIZE, cursor: parsed.data.cursor }));
}
