import { describe, expect, it } from "vitest";
import { addDays, addPeriods, simulatedNow, toBusinessDate } from "./dates";

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
