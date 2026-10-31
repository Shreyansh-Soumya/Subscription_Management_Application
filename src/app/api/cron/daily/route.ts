import { db } from "@/db";
import { runBilling } from "@/lib/billing";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runLifecycle } from "@/lib/lifecycle";

export const maxDuration = 300;

/** Runs once a day from Vercel Cron: plans that ended close themselves, then everything due is billed. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const lifecycle = await runLifecycle(db);
  const billing = await runBilling(db);
  return Response.json({
    closed: lifecycle.closed.length,
    needsRenewal: lifecycle.needsRenewal.length,
    failed: lifecycle.failed.length,
    invoicesCreated: lifecycle.invoicesCreated + billing.created,
    skipped: billing.skipped.length,
  });
}
