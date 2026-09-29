import { describe, expect, it } from "vitest";

import { calendarDateFromIso, type CalendarDate, type YearMonth } from "@/domain/calendar-date";
import { monthWeeks } from "@/domain/calendar-weeks";
import {
  calendarMonths,
  moneyOver,
  selectedDay,
  weekTotals,
  type DayMoney,
} from "@/domain/ledger/calendar";
import { fromMajor, ZERO } from "@/domain/money";

const d = calendarDateFromIso;
const ym = (v: string) => v as YearMonth;
const t = fromMajor;

describe("calendarMonths", () => {
  it("runs from the month the horizon reaches back to the first account's month", () => {
    expect(calendarMonths(d("2026-07-15"), d("2026-09-22"), d("2026-11-21"))).toEqual([
      "2026-11",
      "2026-10",
      "2026-09",
      "2026-08",
      "2026-07",
    ]);
  });

  it("shows no month past the horizon, however far the history reaches", () => {
    expect(calendarMonths(d("2025-01-01"), d("2026-09-01"), d("2026-10-31"))[0]).toBe("2026-10");
    expect(calendarMonths(d("2026-09-01"), d("2026-09-10"), d("2026-09-30"))).toEqual(["2026-09"]);
  });

  it("is only the current month and what is scheduled with no accounts", () => {
    expect(calendarMonths(null, d("2026-09-22"), d("2026-11-21"))).toEqual([
      "2026-11",
      "2026-10",
      "2026-09",
    ]);
  });
});

describe("selectedDay", () => {
  const today = d("2026-09-22");

  it("keeps a real day of the month from the URL", () => {
    expect(selectedDay("2026-09-03", ym("2026-09"), today)).toBe("2026-09-03");
    expect(selectedDay("2026-10-30", ym("2026-10"), today)).toBe("2026-10-30");
  });

  it("shows today in the current month and no day elsewhere by default", () => {
    expect(selectedDay(undefined, ym("2026-09"), today)).toBe(today);
    expect(selectedDay(undefined, ym("2026-08"), today)).toBeNull();
    expect(selectedDay(undefined, ym("2026-10"), today)).toBeNull();
  });

  it.each(["2026-10-05", "2026-09-31", "2026-9-3", "garbage", ["2026-09-03"]])(
    "falls back to the default for %o",
    (requested) => {
      expect(selectedDay(requested, ym("2026-09"), today)).toBe(today);
      expect(selectedDay(requested, ym("2026-08"), today)).toBeNull();
    },
  );
});

describe("week totals", () => {
  const byDay = new Map<CalendarDate, DayMoney>([
    [d("2026-09-01"), { income: t(60_000), spending: t(25) }],
    [d("2026-09-04"), { income: ZERO, spending: t(400) }],
    [d("2026-09-05"), { income: ZERO, spending: t(20_000) }],
    [d("2026-09-12"), { income: ZERO, spending: t(-300) }],
    // Outside September: never in its weeks.
    [d("2026-08-31"), { income: t(1_000), spending: t(9_999) }],
  ]);

  it("sums each week over its own date range", () => {
    const weeks = weekTotals(byDay, monthWeeks(ym("2026-09"), "saturday"));
    expect(weeks.map((w) => [w.range.start, w.income, w.spending])).toEqual([
      ["2026-09-01", t(60_000), t(425)],
      ["2026-09-05", ZERO, t(20_000)],
      ["2026-09-12", ZERO, t(-300)],
      ["2026-09-19", ZERO, ZERO],
      ["2026-09-26", ZERO, ZERO],
    ]);
  });

  it("gives the month's totals whichever day the week starts on", () => {
    const month = moneyOver(byDay, { start: d("2026-09-01"), end: d("2026-10-01") });
    expect(month).toEqual({ income: t(60_000), spending: t(20_125) });
    for (const start of ["saturday", "sunday", "monday"] as const) {
      const weeks = weekTotals(byDay, monthWeeks(ym("2026-09"), start));
      expect(weeks.reduce((a, w) => a + w.spending, 0)).toBe(month.spending);
      expect(weeks.reduce((a, w) => a + w.income, 0)).toBe(month.income);
    }
  });
});
