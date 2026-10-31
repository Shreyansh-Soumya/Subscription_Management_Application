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
