import type { Db } from "@/db";
import { appClock } from "@/db/schema";
import { simulatedNow, toBusinessDate } from "./dates";

/** The current time as the app sees it. Use this for all business logic, never `new Date()`. */
export async function appNow(db: Db): Promise<Date> {
  const [clock] = await db.select({ offsetMs: appClock.offsetMs }).from(appClock).limit(1);
  return simulatedNow(new Date(), clock?.offsetMs ?? 0);
}

/** Today's India date as the app sees it, as "YYYY-MM-DD". */
export async function appToday(db: Db): Promise<string> {
  return toBusinessDate(await appNow(db));
}

/** For the banner: whether the app is on a simulated date, and which date it is. */
export async function getClockState(db: Db): Promise<{ isSimulated: boolean; today: string }> {
  const [clock] = await db.select({ offsetMs: appClock.offsetMs }).from(appClock).limit(1);
  const offsetMs = clock?.offsetMs ?? 0;
  return { isSimulated: offsetMs !== 0, today: toBusinessDate(simulatedNow(new Date(), offsetMs)) };
}

/** Time machine: sets how far the app runs ahead of real time. Zero returns to the real date. */
export async function setClockOffset(db: Db, offsetMs: number): Promise<void> {
  await db
    .insert(appClock)
    .values({ id: 1, offsetMs })
    .onConflictDoUpdate({ target: appClock.id, set: { offsetMs } });
}
