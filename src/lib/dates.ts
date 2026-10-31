// Business dates are India dates stored as "YYYY-MM-DD" strings, so they compare correctly with < and >.

export type BillingFrequency = "daily" | "weekly" | "monthly" | "yearly";

const indiaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function simulatedNow(realNow: Date, offsetMs: number): Date {
  return new Date(realNow.getTime() + offsetMs);
}

export function toBusinessDate(moment: Date): string {
  return indiaDate.format(moment);
}

function parse(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function format(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}

export function addDays(day: string, count: number): string {
  const moment = parse(day);
  moment.setUTCDate(moment.getUTCDate() + count);
  return format(moment);
}

function addMonths(day: string, count: number): string {
  const anchor = parse(day);
  const firstOfTarget = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + count, 1));
  const lastDay = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate();
  firstOfTarget.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
  return format(firstOfTarget);
}

/**
 * The date `count` billing periods after a subscription's start date.
 * Always count from the start date, so a plan started on the 31st returns to the 31st after a short month.
 */
export function addPeriods(anchor: string, frequency: BillingFrequency, count: number): string {
  switch (frequency) {
    case "daily":
      return addDays(anchor, count);
    case "weekly":
      return addDays(anchor, count * 7);
    case "monthly":
      return addMonths(anchor, count);
    case "yearly":
      return addMonths(anchor, count * 12);
  }
}

/** The smallest number of whole billing periods after `anchor` that reaches `day`. */
export function periodsUntil(anchor: string, frequency: BillingFrequency, day: string): number {
  if (day <= anchor) return 0;
  const start = parse(anchor);
  const end = parse(day);
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  const estimate = { daily: days, weekly: Math.floor(days / 7), monthly: months, yearly: Math.floor(months / 12) }[frequency];

  // Start just below the estimate, then step up, so long-running plans take a couple of steps at most.
  let count = Math.max(0, estimate - 1);
  while (addPeriods(anchor, frequency, count) < day) count += 1;
  return count;
}

/** The first billing date on or after `day`, for a subscription that started on `anchor`. */
export function firstBillingDateOnOrAfter(anchor: string, frequency: BillingFrequency, day: string): string {
  return addPeriods(anchor, frequency, periodsUntil(anchor, frequency, day));
}

/** The billing date straight after `current`, for a subscription that started on `anchor`. */
export function nextBillingDateAfter(anchor: string, frequency: BillingFrequency, current: string): string {
  return firstBillingDateOnOrAfter(anchor, frequency, addDays(current, 1));
}
