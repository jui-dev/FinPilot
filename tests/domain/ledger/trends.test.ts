import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  calendarDateFromIso,
  fromEpochDay,
  toEpochDay,
  yearMonthOf,
  type YearMonth,
} from "@/domain/calendar-date";
import {
  comparisonHalves,
  DEFAULT_TREND_LENGTH,
  firstCompleteMonth,
  monthsRange,
  TREND_LENGTHS,
  trendLength,
  trendMonths,
} from "@/domain/ledger/trends";

const d = calendarDateFromIso;
const ym = (value: string) => value as YearMonth;
const months = (from: string, count: number) =>
  Array.from({ length: count }, (_, i) => addMonths(ym(from), i));

describe("trendLength", () => {
  it("offers 6 and 12 months, 6 by default", () => {
    expect(TREND_LENGTHS).toEqual([6, 12]);
    expect(DEFAULT_TREND_LENGTH).toBe(6);
    expect(trendLength("6")).toBe(6);
    expect(trendLength("12")).toBe(12);
  });

  it.each([undefined, "", "3", "24", "12.0", " 12", "twelve", 12, ["12"]])(
    "falls back to 6 for %o",
    (requested) => expect(trendLength(requested)).toBe(6),
  );
});

describe("firstCompleteMonth", () => {
  it("is the opening month when the account opened on the 1st", () => {
    expect(firstCompleteMonth(d("2026-03-01"))).toBe("2026-03");
  });

  it("is the month after when it opened part-way through", () => {
    expect(firstCompleteMonth(d("2026-03-02"))).toBe("2026-04");
    expect(firstCompleteMonth(d("2025-12-31"))).toBe("2026-01");
  });
});

describe("trendMonths", () => {
  it("ends with last month and never includes the current month", () => {
    expect(trendMonths(d("2025-01-01"), d("2026-09-22"), 6)).toEqual(months("2026-03", 6));
    expect(trendMonths(d("2025-01-01"), d("2026-09-22"), 12)).toEqual(months("2025-09", 12));
  });

  it("does not count the current month as complete even on its last day", () => {
    expect(trendMonths(d("2025-01-01"), d("2026-09-30"), 6).at(-1)).toBe("2026-08");
  });

  it("crosses a year boundary", () => {
    expect(trendMonths(d("2024-01-01"), d("2026-02-10"), 6)).toEqual(months("2025-08", 6));
  });

  it("is shorter when the ledger has fewer complete months", () => {
    expect(trendMonths(d("2026-06-01"), d("2026-09-22"), 12)).toEqual(months("2026-06", 3));
  });

  it("leaves out a month an account opened part-way through", () => {
    expect(trendMonths(d("2026-06-15"), d("2026-09-22"), 6)).toEqual(["2026-07", "2026-08"]);
  });

  it("is empty with no accounts, or with nothing complete yet", () => {
    expect(trendMonths(null, d("2026-09-22"), 6)).toEqual([]);
    expect(trendMonths(d("2026-09-01"), d("2026-09-22"), 6)).toEqual([]);
    expect(trendMonths(d("2026-08-02"), d("2026-09-22"), 6)).toEqual([]);
  });

  it("is always contiguous, complete and within the length", () => {
    const day = (min: string, max: string) =>
      fc.integer({ min: toEpochDay(d(min)), max: toEpochDay(d(max)) }).map(fromEpochDay);
    fc.assert(
      fc.property(
        day("2020-01-01", "2026-12-31"),
        fc.integer({ min: 0, max: 2_000 }),
        fc.constantFrom(...TREND_LENGTHS),
        (opened, gap, length) => {
          const today = addDays(opened, gap);
          const result = trendMonths(opened, today, length);
          expect(result.length).toBeLessThanOrEqual(length);
          result.forEach((m, i) => i > 0 && expect(m).toBe(addMonths(result[i - 1]!, 1)));
          if (result.length > 0) {
            expect(result.at(-1)).toBe(addMonths(yearMonthOf(today), -1));
            expect(result[0]! >= firstCompleteMonth(opened)).toBe(true);
          }
          // Only as short as the history forces it to be.
          if (result.length < length && result.length > 0)
            expect(result[0]).toBe(firstCompleteMonth(opened));
        },
      ),
    );
  });
});

describe("monthsRange", () => {
  it("runs from the first day of the first month to the day after the last", () => {
    expect(monthsRange(months("2026-01", 3))).toEqual({ start: "2026-01-01", end: "2026-04-01" });
    expect(monthsRange(["2025-12" as YearMonth])).toEqual({
      start: "2025-12-01",
      end: "2026-01-01",
    });
  });

  it("needs at least one month", () => {
    expect(() => monthsRange([])).toThrow(RangeError);
  });
});

describe("comparisonHalves", () => {
  it("splits 6 months into 3 against 3, and 12 into 6 against 6", () => {
    const six = comparisonHalves(months("2026-03", 6))!;
    expect(six.earlier).toEqual({
      months: months("2026-03", 3),
      range: { start: "2026-03-01", end: "2026-06-01" },
    });
    expect(six.recent).toEqual({
      months: months("2026-06", 3),
      range: { start: "2026-06-01", end: "2026-09-01" },
    });
    const twelve = comparisonHalves(months("2025-09", 12))!;
    expect(twelve.earlier.months).toEqual(months("2025-09", 6));
    expect(twelve.recent.months).toEqual(months("2026-03", 6));
  });

  it("leaves the middle month out of both halves when the count is odd", () => {
    const halves = comparisonHalves(months("2026-04", 5))!;
    expect(halves.earlier.months).toEqual(["2026-04", "2026-05"]);
    expect(halves.recent.months).toEqual(["2026-07", "2026-08"]);
    expect(comparisonHalves(months("2026-06", 3))).toMatchObject({
      earlier: { months: ["2026-06"] },
      recent: { months: ["2026-08"] },
    });
  });

  it("is null when the window is not yet a trend", () => {
    expect(comparisonHalves([])).toBeNull();
    expect(comparisonHalves(months("2026-08", 1))).toBeNull();
    expect(comparisonHalves(months("2026-07", 2))).toBeNull();
  });

  it("always gives equal, disjoint halves at the two ends of the window", () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 12 }), (count) => {
        const window = months("2025-06", count);
        const { earlier, recent } = comparisonHalves(window)!;
        expect(earlier.months.length).toBe(recent.months.length);
        expect(earlier.months.length).toBe(Math.floor(count / 2));
        expect(earlier.months[0]).toBe(window[0]);
        expect(recent.months.at(-1)).toBe(window.at(-1));
        expect(earlier.range.end <= recent.range.start).toBe(true);
      }),
    );
  });
});
