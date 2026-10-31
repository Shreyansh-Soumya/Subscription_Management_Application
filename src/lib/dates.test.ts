import { describe, expect, it } from "vitest";
import {
  addDays,
  addPeriods,
  firstBillingDateOnOrAfter,
  nextBillingDateAfter,
  periodsUntil,
  resumeBillingDate,
  simulatedNow,
  toBusinessDate,
} from "./dates";

describe("billing date helpers", () => {
  it("keeps a billing date that falls exactly on the given day", () => {
    expect(firstBillingDateOnOrAfter("2026-01-15", "monthly", "2026-03-15")).toBe("2026-03-15");
  });

  it("finds the next billing date in between", () => {
    expect(firstBillingDateOnOrAfter("2026-01-15", "monthly", "2026-03-16")).toBe("2026-04-15");
  });

  it("returns the start date for a day before the subscription starts", () => {
    expect(firstBillingDateOnOrAfter("2026-01-15", "yearly", "2025-06-01")).toBe("2026-01-15");
  });

  it("returns to the 31st after a short month", () => {
    expect(nextBillingDateAfter("2026-01-31", "monthly", "2026-02-28")).toBe("2026-03-31");
  });

  it("resumes in the billing period containing the day", () => {
    expect(resumeBillingDate("2026-01-15", "monthly", "2026-03-15", "2026-03-17")).toBe("2026-03-15");
    expect(resumeBillingDate("2026-01-15", "monthly", "2026-02-15", "2026-06-20")).toBe("2026-06-15");
    expect(resumeBillingDate("2026-01-15", "monthly", "2026-02-15", "2026-06-15")).toBe("2026-06-15");
  });

  it("never moves back over a period already billed on resume", () => {
    expect(resumeBillingDate("2026-01-15", "monthly", "2026-04-15", "2026-03-17")).toBe("2026-04-15");
  });

  it("resumes from the start date before a subscription has started", () => {
    expect(resumeBillingDate("2026-05-15", "monthly", null, "2026-03-17")).toBe("2026-05-15");
  });

  it("counts whole periods up to a date", () => {
    expect(periodsUntil("2026-01-15", "monthly", "2026-01-15")).toBe(0);
    expect(periodsUntil("2026-01-15", "monthly", "2026-01-16")).toBe(1);
    expect(periodsUntil("2026-01-31", "monthly", "2026-02-28")).toBe(1);
    expect(periodsUntil("2026-01-31", "monthly", "2026-03-01")).toBe(2);
    expect(periodsUntil("2028-02-29", "yearly", "2029-02-28")).toBe(1);
    expect(periodsUntil("2026-01-01", "weekly", "2026-01-09")).toBe(2);
    expect(periodsUntil("2026-01-15", "daily", "2025-01-01")).toBe(0);
  });

  it("agrees with counting one period at a time", () => {
    for (const frequency of ["daily", "weekly", "monthly", "yearly"] as const) {
      for (const anchor of ["2024-01-31", "2024-02-29", "2023-12-15"]) {
        for (let offset = -5; offset < 800; offset += 7) {
          const day = addDays(anchor, offset);
          let slow = 0;
          while (addPeriods(anchor, frequency, slow) < day) slow += 1;
          expect(periodsUntil(anchor, frequency, day)).toBe(slow);
        }
      }
    }
  });

  it("handles a daily plan 10 years old without walking every day", () => {
    const started = performance.now();
    for (let i = 0; i < 2000; i += 1) nextBillingDateAfter("2016-01-01", "daily", "2026-01-01");
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("simulatedNow", () => {
  it("adds the time machine offset to the real time", () => {
    const real = new Date("2026-10-31T00:00:00Z");
    const oneDay = 86_400_000;
    expect(simulatedNow(real, oneDay).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});

describe("toBusinessDate", () => {
  it("uses the India date, which is ahead of UTC late in the evening", () => {
    expect(toBusinessDate(new Date("2026-10-31T20:00:00Z"))).toBe("2026-11-01");
  });
});

describe("addDays", () => {
  it("crosses month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});

describe("addPeriods", () => {
  it("handles daily, weekly and yearly plans", () => {
    expect(addPeriods("2026-01-15", "daily", 1)).toBe("2026-01-16");
    expect(addPeriods("2026-01-15", "weekly", 2)).toBe("2026-01-29");
    expect(addPeriods("2026-01-15", "yearly", 1)).toBe("2027-01-15");
  });

  it("clamps monthly billing to the last day of a short month", () => {
    expect(addPeriods("2026-01-31", "monthly", 1)).toBe("2026-02-28");
  });

  it("returns to the original day after a short month", () => {
    expect(addPeriods("2026-01-31", "monthly", 2)).toBe("2026-03-31");
  });

  it("clamps a yearly plan started on a leap day", () => {
    expect(addPeriods("2028-02-29", "yearly", 1)).toBe("2029-02-28");
  });
});
