import { and, count, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { events, invoices } from "@/db/schema";
import { appNow, appToday, setClockOffset } from "./clock";
import { addDays } from "./dates";
import { type LifecycleResult, runLifecycle } from "./lifecycle";

/** Its message is safe to show to the user. */
export class TimeMachineError extends Error {}

const MAX_JUMP_DAYS = 3650;
const SYSTEM_ENTITY_ID = "00000000-0000-0000-0000-000000000000";

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const moment = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(moment.getTime()) && moment.toISOString().slice(0, 10) === value;
}

export type JumpResult = LifecycleResult & { from: string; to: string; newlyOverdue: number };

/**
 * Admin only: moves the whole app forward to `date`. Check the caller's role before calling this.
 * Plans that ended close themselves, but ordinary billing still waits for the billing run.
 */
export async function jumpToDate(db: Db, input: { date: string; actorId?: string }): Promise<JumpResult> {
  const { date, actorId } = input;
  if (!isRealDate(date)) throw new TimeMachineError(`${date} isn't a valid date.`);

  const from = await appToday(db);
  if (date <= from) throw new TimeMachineError(`Choose a date after ${from}.`);
  if (date > addDays(from, MAX_JUMP_DAYS)) throw new TimeMachineError("Jump no more than 10 years at a time.");

  const [overdue] = await db
    .select({ total: count() })
    .from(invoices)
    .where(
      and(
        eq(invoices.status, "confirmed"),
        gte(invoices.dueDate, from),
        lt(invoices.dueDate, date),
        lt(invoices.paidPaise, sql`${invoices.totalPaise}`),
      ),
    );

  // Noon in India, so the app stays on the chosen date for at least the next 12 hours.
  const offsetMs = new Date(`${date}T12:00:00+05:30`).getTime() - Date.now();
  await db.transaction(async (tx) => {
    await setClockOffset(tx, offsetMs);
    await tx.insert(events).values({
      entityType: "system",
      entityId: SYSTEM_ENTITY_ID,
      type: "time_machine_jump",
      fromStatus: from,
      toStatus: date,
      actorId,
      occurredAt: await appNow(tx),
    });
  });

  return { ...(await runLifecycle(db, { today: date })), from, to: date, newlyOverdue: overdue.total };
}

/**
 * Admin only: returns the clock to the real date. Records already created stay as they are,
 * so some may be dated in the future.
 */
export async function returnToRealDate(db: Db, input: { actorId?: string }): Promise<void> {
  const from = await appToday(db);
  await db.transaction(async (tx) => {
    await setClockOffset(tx, 0);
    await tx.insert(events).values({
      entityType: "system",
      entityId: SYSTEM_ENTITY_ID,
      type: "time_machine_reset",
      fromStatus: from,
      toStatus: await appToday(tx),
      actorId: input.actorId,
      occurredAt: await appNow(tx),
    });
  });
}
