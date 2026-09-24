import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  calendarDate,
  calendarDateFromIso,
  compareDates,
  daysBetween,
  daysInMonth,
  daysInYearMonth,
  elapsedDaysInMonth,
  fromEpochDay,
  inclusiveRange,
  likeForLikeWindows,
  monthRange,
  parseCalendarDate,
  rangeContains,
  rangeLength,
  remainingDaysInMonth,
  toEpochDay,
  yearMonth,
  yearMonthOf,
  type CalendarDate,
} from "@/domain/calendar-date";

const d = calendarDateFromIso;

/** Any valid calendar date in years 2–9998 (leaves room for ±1 month/day steps). */
const anyDate = fc
  .record({
    year: fc.integer({ min: 2, max: 9998 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 31 }),
  })
  .map(({ year, month, day }) =>
    calendarDate(year, month, Math.min(day, daysInMonth(year, month))),
  );

/** Reference implementation using the JS engine's UTC calendar (tests only). */
function referenceEpochDay(date: CalendarDate): number {
  const [y, m, day] = date.split("-").map(Number) as [number, number, number];
  const utc = new Date(0);
  utc.setUTCFullYear(y, m - 1, day);
  return Math.round(utc.getTime() / 86_400_000);
}

describe("CalendarDate construction and parsing", () => {
  it("builds zero-padded ISO text", () => {
    expect(calendarDate(2026, 9, 22)).toBe("2026-09-22");
    expect(calendarDate(1, 1, 1)).toBe("0001-01-01");
  });

  it.each([
    [2026, 2, 29],
    [2026, 4, 31],
    [2026, 13, 1],
    [2026, 0, 1],
    [0, 1, 1],
    [10000, 1, 1],
    [2026, 1, 1.5],
  ])("rejects %i-%i-%s", (y, m, day) => {
    expect(() => calendarDate(y, m, day)).toThrow(RangeError);
  });

  it("knows leap years", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });

  it.each(["2026-9-22", "2026-02-30", "22-09-2026", "2026-09-22T00:00:00Z", " 2026-09-22", ""])(
    "parseCalendarDate rejects %j",
    (input) => {
      expect(parseCalendarDate(input).ok).toBe(false);
    },
  );

  it("parse/format round trip for every valid date", () => {
    fc.assert(
      fc.property(anyDate, (date) => {
        expect(parseCalendarDate(date)).toEqual({ ok: true, value: date });
      }),
    );
  });
});

describe("Day arithmetic", () => {
  it("anchors the epoch", () => {
    expect(toEpochDay(d("1970-01-01"))).toBe(0);
    expect(fromEpochDay(0)).toBe("1970-01-01");
    expect(toEpochDay(d("1969-12-31"))).toBe(-1);
  });

  it("matches the JS engine's UTC calendar for every date", () => {
    fc.assert(
      fc.property(anyDate, (date) => {
        expect(toEpochDay(date)).toBe(referenceEpochDay(date));
      }),
    );
  });

  it("epoch days are a bijection", () => {
    fc.assert(
      fc.property(anyDate, (date) => {
        expect(fromEpochDay(toEpochDay(date))).toBe(date);
      }),
    );
  });

  it("addDays / daysBetween are consistent and ordering matches text ordering", () => {
    fc.assert(
      fc.property(anyDate, anyDate, fc.integer({ min: -366, max: 366 }), (a, b, n) => {
        expect(daysBetween(a, b)).toBe(-daysBetween(b, a) || 0);
        expect(Math.sign(daysBetween(a, b))).toBe(compareDates(b, a));
        const moved = addDays(a, n);
        expect(daysBetween(a, moved)).toBe(n);
      }),
    );
  });

  it("crosses month, year and leap boundaries", () => {
    expect(addDays(d("2026-09-30"), 1)).toBe("2026-10-01");
    expect(addDays(d("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(d("2028-02-28"), 1)).toBe("2028-02-29");
    expect(addDays(d("2026-02-28"), 1)).toBe("2026-03-01");
    expect(daysBetween(d("2026-09-22"), d("2026-10-22"))).toBe(30);
  });
});

describe("Months", () => {
  it("adds months across years", () => {
    expect(addMonths(yearMonth(2026, 9), -1)).toBe("2026-08");
    expect(addMonths(yearMonth(2026, 1), -1)).toBe("2025-12");
    expect(addMonths(yearMonth(2026, 12), 1)).toBe("2027-01");
    expect(addMonths(yearMonth(2026, 9), 24)).toBe("2028-09");
  });

  it("month ranges are half-open [1st, next 1st)", () => {
    expect(monthRange(yearMonth(2026, 9))).toEqual({ start: "2026-09-01", end: "2026-10-01" });
    expect(rangeLength(monthRange(yearMonth(2028, 2)))).toBe(29);
  });

  it("months partition time: every date is in exactly its own month, and months are contiguous", () => {
    fc.assert(
      fc.property(anyDate, (date) => {
        const month = yearMonthOf(date);
        const range = monthRange(month);
        expect(rangeContains(range, date)).toBe(true);
        expect(rangeContains(monthRange(addMonths(month, -1)), date)).toBe(false);
        expect(rangeContains(monthRange(addMonths(month, 1)), date)).toBe(false);
        expect(monthRange(addMonths(month, 1)).start).toBe(range.end);
        expect(rangeLength(range)).toBe(daysInYearMonth(month));
      }),
    );
  });
});

describe("Inclusive ranges from untrusted text", () => {
  it("turns inclusive from/to into a half-open range", () => {
    expect(inclusiveRange("2026-08-01", "2026-08-22")).toEqual({
      start: "2026-08-01",
      end: "2026-08-23",
    });
    expect(inclusiveRange("2026-09-22", "2026-09-22")).toEqual({
      start: "2026-09-22",
      end: "2026-09-23",
    });
    expect(inclusiveRange("2026-08-30", "2026-09-30")?.end).toBe("2026-10-01");
    expect(inclusiveRange("2025-12-01", "2025-12-31")?.end).toBe("2026-01-01");
  });

  it("rejects missing, malformed, unreal and reversed ranges", () => {
    expect(inclusiveRange("2026-08-01", undefined)).toBeNull();
    expect(inclusiveRange(undefined, "2026-08-22")).toBeNull();
    expect(inclusiveRange(["2026-08-01"], "2026-08-22")).toBeNull();
    expect(inclusiveRange("", "")).toBeNull();
    expect(inclusiveRange("2026-8-1", "2026-08-22")).toBeNull();
    expect(inclusiveRange("2026-02-30", "2026-03-01")).toBeNull();
    expect(inclusiveRange("2026-08-01", "yesterday")).toBeNull();
    expect(inclusiveRange("2026-08-23", "2026-08-22")).toBeNull();
  });
});

describe("Month-to-date day counts", () => {
  it("counts today as elapsed (Sep 22 → 22 elapsed, 8 remaining)", () => {
    expect(elapsedDaysInMonth(d("2026-09-22"))).toBe(22);
    expect(remainingDaysInMonth(d("2026-09-22"))).toBe(8);
  });

  it("elapsed + remaining = days in month", () => {
    fc.assert(
      fc.property(anyDate, (date) => {
        expect(elapsedDaysInMonth(date) + remainingDaysInMonth(date)).toBe(
          daysInYearMonth(yearMonthOf(date)),
        );
      }),
    );
  });
});

describe("Like-for-like windows (docs/domain-model.md §11)", () => {
  it("acceptance date: Sep 1–22 vs Aug 1–22", () => {
    expect(likeForLikeWindows(d("2026-09-22"))).toEqual({
      current: { start: "2026-09-01", end: "2026-09-23" },
      previous: { start: "2026-08-01", end: "2026-08-23" },
    });
  });

  it("clamps to the previous month's length (Mar 31 → all of February)", () => {
    expect(likeForLikeWindows(d("2026-03-31")).previous).toEqual({
      start: "2026-02-01",
      end: "2026-03-01",
    });
    expect(rangeLength(likeForLikeWindows(d("2028-03-31")).previous)).toBe(29);
    expect(likeForLikeWindows(d("2026-01-15")).previous).toEqual({
      start: "2025-12-01",
      end: "2025-12-16",
    });
  });

  it("never exceeds the previous month, and matches the current window length when possible", () => {
    fc.assert(
      fc.property(anyDate, (today) => {
        const { current, previous } = likeForLikeWindows(today);
        const previousMonth = monthRange(addMonths(yearMonthOf(today), -1));
        expect(previous.start).toBe(previousMonth.start);
        expect(previous.end <= previousMonth.end).toBe(true);
        expect(rangeLength(previous)).toBe(
          Math.min(rangeLength(current), rangeLength(previousMonth)),
        );
        expect(rangeContains(current, today)).toBe(true);
        expect(current.end).toBe(addDays(today, 1));
      }),
    );
  });
});
