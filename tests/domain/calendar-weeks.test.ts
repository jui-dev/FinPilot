import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  calendarDateFromIso,
  monthRange,
  type YearMonth,
} from "@/domain/calendar-date";
import { monthWeeks, WEEKDAYS, weekdayIndex, weekdayOf } from "@/domain/calendar-weeks";

const d = calendarDateFromIso;
const ym = (v: string) => v as YearMonth;

describe("weekdayOf", () => {
  it("names the day of the week from the date alone", () => {
    expect(weekdayOf(d("1970-01-01"))).toBe("thursday");
    expect(weekdayOf(d("2026-09-01"))).toBe("tuesday");
    expect(weekdayOf(d("2026-09-26"))).toBe("saturday");
    expect(weekdayOf(d("2028-02-29"))).toBe("tuesday");
    expect(weekdayOf(d("1969-12-31"))).toBe("wednesday");
  });

  it("counts a day's place in a week from the chosen first day", () => {
    expect(weekdayIndex(d("2026-09-26"), "saturday")).toBe(0);
    expect(weekdayIndex(d("2026-09-25"), "saturday")).toBe(6);
    expect(weekdayIndex(d("2026-09-28"), "monday")).toBe(0);
  });
});

describe("monthWeeks", () => {
  it("splits September 2026 into Saturday-first weeks, clipped to the month", () => {
    expect(monthWeeks(ym("2026-09"), "saturday").map((w) => w.range)).toEqual([
      { start: "2026-09-01", end: "2026-09-05" },
      { start: "2026-09-05", end: "2026-09-12" },
      { start: "2026-09-12", end: "2026-09-19" },
      { start: "2026-09-19", end: "2026-09-26" },
      { start: "2026-09-26", end: "2026-10-01" },
    ]);
  });

  it("follows another convention just as well", () => {
    const monday = monthWeeks(ym("2026-09"), "monday");
    expect(monday[0]!.days).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
    expect(monday.at(-1)!.range).toEqual({ start: "2026-09-28", end: "2026-10-01" });
  });

  it("keeps a month that starts on the first weekday whole from its 1st", () => {
    // 1 August 2026 is a Saturday.
    expect(monthWeeks(ym("2026-08"), "saturday")[0]!.days).toHaveLength(7);
  });

  it("puts every day of any month in exactly one week, back to back", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -600, max: 600 }),
        fc.constantFrom(...WEEKDAYS),
        (offset, start) => {
          const month = addMonths(ym("2026-01"), offset);
          const weeks = monthWeeks(month, start);
          const whole = monthRange(month);
          expect(weeks[0]!.range.start).toBe(whole.start);
          expect(weeks.at(-1)!.range.end).toBe(whole.end);
          weeks.forEach((w, i) => {
            if (i > 0) expect(w.range.start).toBe(weeks[i - 1]!.range.end);
            expect(w.days.length).toBeGreaterThan(0);
            expect(w.days.length).toBeLessThanOrEqual(7);
            expect(w.days[0]).toBe(w.range.start);
            expect(addDays(w.days.at(-1)!, 1)).toBe(w.range.end);
            if (i > 0) expect(weekdayOf(w.days[0]!)).toBe(start);
          });
          expect(weeks.flatMap((w) => w.days)).toHaveLength(
            (Date.parse(whole.end) - Date.parse(whole.start)) / 86_400_000,
          );
        },
      ),
    );
  });
});
