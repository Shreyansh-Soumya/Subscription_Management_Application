import { db } from "@/db";
import { confirmDraftInvoices } from "@/lib/invoices";
import { authorizeRoute } from "@/lib/permissions";

export const maxDuration = 60;

const BATCH_SIZE = 200;

/** Confirms one batch. The screen calls this repeatedly until `hasMore` is false. */
export async function POST() {
  const access = await authorizeRoute(["admin", "staff"]);
  if ("response" in access) return access.response;

  return Response.json(await confirmDraftInvoices(db, { limit: BATCH_SIZE, actorId: access.user.id }));
}
