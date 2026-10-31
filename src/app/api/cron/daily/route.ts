import { db } from "@/db";
import { runBilling } from "@/lib/billing";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runLifecycle } from "@/lib/lifecycle";

export const maxDuration = 300;

async function attempt<T>(name: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.error(`${name} failed in the daily job`, error);
    return null;
  }
}

/** Runs once a day from Vercel Cron: plans that ended close themselves, then everything due is billed. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Closing and billing run independently, so a problem in one doesn't stop the other.
  const [lifecycle, billing] = [await attempt("Lifecycle", () => runLifecycle(db)), await attempt("Billing", () => runBilling(db))];
  const failed = (lifecycle?.failed.length ?? 0) + (billing?.failed.length ?? 0);

  return Response.json(
    {
      lifecycleRan: lifecycle !== null,
      billingRan: billing !== null,
      closed: lifecycle?.closed.length ?? 0,
      needsRenewal: lifecycle?.needsRenewal.length ?? 0,
      needsClosing: lifecycle?.needsClosing.length ?? 0,
      invoicesCreated: (lifecycle?.invoicesCreated ?? 0) + (billing?.created ?? 0),
      skipped: billing?.skipped.length ?? 0,
      failed,
    },
    // A failure status makes the problem show up in Vercel's cron logs.
    { status: lifecycle && billing && failed === 0 ? 200 : 500 },
  );
}
