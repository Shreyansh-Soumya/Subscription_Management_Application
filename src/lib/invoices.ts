import { asc, count, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { invoices } from "@/db/schema";
import { transitionInvoice } from "./transition";

const DEFAULT_BATCH = 200;
const PARALLEL_INVOICES = 8;

export type ConfirmResult = {
  confirmed: number;
  failed: { invoiceId: string; number: string }[];
  hasMore: boolean;
};

export async function countDraftInvoices(db: Db): Promise<number> {
  const [row] = await db.select({ total: count() }).from(invoices).where(eq(invoices.status, "draft"));
  return row.total;
}

/**
 * Confirms draft invoices in bulk, checking the same rules as confirming one at a time.
 * With `limit`, handles one batch: call again while `hasMore` is true to show live progress.
 * Without it, runs to the end. Check the caller's role before calling this.
 */
export async function confirmDraftInvoices(
  db: Db,
  options: { limit?: number; actorId?: string } = {},
): Promise<ConfirmResult> {
  const total: ConfirmResult = { confirmed: 0, failed: [], hasMore: false };
  const seenFailures = new Set<string>();

  for (;;) {
    const size = options.limit ?? DEFAULT_BATCH;
    const drafts = await db
      .select({ id: invoices.id, number: invoices.number })
      .from(invoices)
      .where(eq(invoices.status, "draft"))
      .orderBy(asc(invoices.id))
      .limit(size + seenFailures.size + 1);
    const pending = drafts.filter((draft) => !seenFailures.has(draft.id));
    const batch = pending.slice(0, size);

    let next = 0;
    const worker = async () => {
      while (next < batch.length) {
        const draft = batch[next];
        next += 1;
        try {
          await transitionInvoice(db, { id: draft.id, to: "confirmed", actorId: options.actorId });
          total.confirmed += 1;
        } catch (error) {
          console.error(`Confirming ${draft.number} failed`, error);
          seenFailures.add(draft.id);
          total.failed.push({ invoiceId: draft.id, number: draft.number });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_INVOICES, batch.length) }, worker));

    total.hasMore = pending.length > batch.length;
    if (options.limit !== undefined || !total.hasMore) return total;
  }
}
