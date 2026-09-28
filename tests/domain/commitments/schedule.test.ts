import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  addDays,
  calendarDate,
  calendarDateFromIso,
  daysInMonth,
  isLeapYear,
  toParts,
  type CalendarDate,
} from "@/domain/calendar-date";
import {
  checkCommitmentRule,
  dueDateAt,
  dueDatesIn,
  type CommitmentFrequency,
  type CommitmentSchedule,
} from "@/domain/commitments/schedule";
import { fromMajor } from "@/domain/money";

const d = calendarDateFromIso;
const range = (start: string, end: string) => ({ start: d(start), end: d(end) });

const monthly = (anchorOn: string, interval = 1, endOn: string | null = null) =>
  ({
    frequency: "monthly",
    interval,
    anchorOn: d(anchorOn),
    endOn: endOn === null ? null : d(endOn),
  }) satisfies CommitmentSchedule;

const yearly = (anchorOn: string, interval = 1, endOn: string | null = null) =>
  ({ ...monthly(anchorOn, interval, endOn), frequency: "yearly" }) satisfies CommitmentSchedule;

/** The first `count` due dates of a schedule. */
const first = (schedule: CommitmentSchedule, count: number) =>
  Array.from({ length: count }, (_, i) => dueDateAt(schedule, i));

describe("monthly schedules clamp to month end without drifting", () => {
  it("keeps the 28th every month", () => {
    expect(first(monthly("2027-01-28"), 3)).toEqual(["2027-01-28", "2027-02-28", "2027-03-28"]);
  });

  it("clamps the 29th to Feb 28 in a common year and keeps Feb 29 in a leap year", () => {
    expect(first(monthly("2027-01-29"), 3)).toEqual(["2027-01-29", "2027-02-28", "2027-03-29"]);
    expect(first(monthly("2028-01-29"), 3)).toEqual(["2028-01-29", "2028-02-29", "2028-03-29"]);
  });

  it("clamps the 30th in February, then returns to the 30th", () => {
    expect(first(monthly("2027-01-30"), 4)).toEqual([
      "2027-01-30",
      "2027-02-28",
      "2027-03-30",
      "2027-04-30",
    ]);
    expect(dueDateAt(monthly("2028-01-30"), 1)).toBe("2028-02-29");
  });

  it("recovers the 31st after February and after every 30-day month", () => {
    expect(first(monthly("2026-01-31"), 8)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
      "2026-07-31",
      "2026-08-31",
    ]);
    expect(dueDateAt(monthly("2028-01-31"), 1)).toBe("2028-02-29");
  });

  it("crosses year ends", () => {
    expect(first(monthly("2026-11-30"), 4)).toEqual([
      "2026-11-30",
      "2026-12-30",
      "2027-01-30",
      "2027-02-28",
    ]);
  });
});

describe("yearly schedules", () => {
  it("clamps Feb 29 to Feb 28 in common years and returns to Feb 29 in leap years", () => {
    expect(first(yearly("2028-02-29"), 5)).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
      "2031-02-28",
      "2032-02-29",
    ]);
  });

  it("follows the Gregorian century rule (2100 is not a leap year, 2400 is)", () => {
    const schedule = yearly("2096-02-29", 4);
    expect(dueDateAt(schedule, 1)).toBe("2100-02-28");
    expect(dueDateAt(schedule, 2)).toBe("2104-02-29");
    expect(dueDateAt(yearly("2396-02-29", 4), 1)).toBe("2400-02-29");
  });

  it("repeats on the anchor date every `interval` years", () => {
    expect(first(yearly("2026-07-15", 2), 3)).toEqual(["2026-07-15", "2028-07-15", "2030-07-15"]);
  });
});

describe("intervals", () => {
  it("every 3 months from the 31st", () => {
    expect(first(monthly("2026-01-31", 3), 5)).toEqual([
      "2026-01-31",
      "2026-04-30",
      "2026-07-31",
      "2026-10-31",
      "2027-01-31",
    ]);
  });

  it("every 2 months from Dec 31 clamps in a leap February and recovers", () => {
    expect(first(monthly("2027-12-31", 2), 3)).toEqual(["2027-12-31", "2028-02-29", "2028-04-30"]);
  });
});

describe("dueDatesIn", () => {
  it("returns the dates inside a half-open range", () => {
    expect(dueDatesIn(monthly("2026-08-01"), range("2026-08-01", "2026-11-22"))).toEqual([
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
    ]);
    // The end is exclusive, the start inclusive.
    expect(dueDatesIn(monthly("2026-08-01"), range("2026-09-01", "2026-10-01"))).toEqual([
      "2026-09-01",
    ]);
  });

  it("starts at the anchor even when the range starts earlier (a future anchor)", () => {
    // Acceptance fixture: Streaming starts Oct 3; nothing before it.
    expect(dueDatesIn(monthly("2026-10-03"), range("2026-08-01", "2026-11-22"))).toEqual([
      "2026-10-03",
      "2026-11-03",
    ]);
    expect(dueDatesIn(monthly("2026-12-03"), range("2026-08-01", "2026-11-22"))).toEqual([]);
  });

  it("starts deep into a schedule with the same dates a walk from the anchor gives", () => {
    expect(dueDatesIn(monthly("2020-01-31"), range("2026-02-01", "2026-05-01"))).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("is empty for an empty or inverted range", () => {
    expect(dueDatesIn(monthly("2026-08-01"), range("2026-09-01", "2026-09-01"))).toEqual([]);
    expect(dueDatesIn(monthly("2026-08-01"), range("2026-10-01", "2026-09-01"))).toEqual([]);
  });
});

describe("end date (inclusive)", () => {
  it("includes a due date on the end date and nothing after it", () => {
    expect(
      dueDatesIn(monthly("2026-08-01", 1, "2026-10-01"), range("2026-01-01", "2027-01-01")),
    ).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
    expect(
      dueDatesIn(monthly("2026-08-01", 1, "2026-09-30"), range("2026-01-01", "2027-01-01")),
    ).toEqual(["2026-08-01", "2026-09-01"]);
  });

  it("compares the end date with the clamped date, not the anchor's day", () => {
    // Feb's due date is the 28th, so an end date of Feb 28 includes it.
    expect(
      dueDatesIn(monthly("2027-01-31", 1, "2027-02-28"), range("2027-01-01", "2028-01-01")),
    ).toEqual(["2027-01-31", "2027-02-28"]);
  });

  it("gives exactly one occurrence when it equals the anchor", () => {
    expect(
      dueDatesIn(yearly("2026-12-15", 1, "2026-12-15"), range("2026-01-01", "2030-01-01")),
    ).toEqual(["2026-12-15"]);
  });

  it("does not limit dueDateAt, which is the unbounded rule", () => {
    expect(dueDateAt(monthly("2026-08-01", 1, "2026-08-01"), 2)).toBe("2026-10-01");
  });
});

describe("checkCommitmentRule", () => {
  const rule = (schedule: CommitmentSchedule, amount = 30_000) => ({
    schedule,
    expectedAmount: fromMajor(amount),
  });

  it("accepts monthly and yearly rules", () => {
    expect(checkCommitmentRule(rule(monthly("2026-08-01")))).toBeUndefined();
    expect(checkCommitmentRule(rule(yearly("2026-08-01", 3)))).toBeUndefined();
    expect(checkCommitmentRule(rule(monthly("2026-08-01", 1, "2026-08-01")))).toBeUndefined();
  });

  it("rejects weekly and unknown frequencies (weekly is deferred beyond V1)", () => {
    for (const frequency of ["weekly", "daily"]) {
      const schedule = { ...monthly("2026-08-01"), frequency } as unknown as CommitmentSchedule;
      expect(checkCommitmentRule(rule(schedule))?.code).toBe("unsupported_frequency");
    }
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "2"])(
    "rejects interval %s",
    (interval) => {
      const schedule = monthly("2026-08-01", interval as number);
      expect(checkCommitmentRule(rule(schedule))?.code).toBe("invalid_interval");
    },
  );

  it("sets no upper bound on the interval: a very long one simply falls due rarely", () => {
    const schedule = monthly("2026-08-01", 1_000_000);
    expect(checkCommitmentRule(rule(schedule))).toBeUndefined();
    expect(dueDateAt(schedule, 1)).toBeNull();
    expect(dueDatesIn(schedule, range("2026-01-01", "2100-01-01"))).toEqual(["2026-08-01"]);
  });

  it("rejects an end date before the first due date", () => {
    expect(checkCommitmentRule(rule(monthly("2026-08-01", 1, "2026-07-31")))?.code).toBe(
      "end_before_anchor",
    );
  });

  it.each([0, -500])("rejects an expected amount of %s", (amount) => {
    expect(checkCommitmentRule(rule(monthly("2026-08-01"), amount))?.code).toBe("invalid_amount");
  });

  it("makes the generators refuse an invalid schedule rather than guess", () => {
    expect(() => dueDateAt(monthly("2026-08-01", 0), 0)).toThrow(RangeError);
    expect(() => dueDatesIn(monthly("2026-08-01", 0), range("2026-08-01", "2026-09-01"))).toThrow(
      RangeError,
    );
    expect(() => dueDateAt(monthly("2026-08-01"), -1)).toThrow(RangeError);
  });

  it("stops at the last supported year instead of failing", () => {
    expect(dueDateAt(yearly("9999-06-01"), 1)).toBeNull();
    expect(dueDatesIn(yearly("9998-06-01"), range("9998-01-01", "9999-12-31"))).toEqual([
      "9998-06-01",
      "9999-06-01",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

const anySchedule = fc
  .record({
    frequency: fc.constantFrom<CommitmentFrequency>("monthly", "yearly"),
    interval: fc.integer({ min: 1, max: 12 }),
    year: fc.integer({ min: 1990, max: 2100 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 31 }),
  })
  .map(({ frequency, interval, year, month, day }): CommitmentSchedule => ({
    frequency,
    interval,
    anchorOn: calendarDate(year, month, Math.min(day, daysInMonth(year, month))),
    endOn: null,
  }));

/** Months after the anchor's month for the n-th due date. */
const stepOf = (s: CommitmentSchedule) => s.interval * (s.frequency === "yearly" ? 12 : 1);
const monthIndex = (date: CalendarDate) => {
  const { year, month } = toParts(date);
  return year * 12 + month - 1;
};

describe("schedule properties", () => {
  const RUNS = { numRuns: 200 };

  it("every due date derives from the original anchor: its month and its clamped day", () => {
    fc.assert(
      fc.property(anySchedule, fc.integer({ min: 0, max: 240 }), (schedule, n) => {
        const due = dueDateAt(schedule, n)!;
        const { year, month, day } = toParts(due);
        expect(monthIndex(due)).toBe(monthIndex(schedule.anchorOn) + n * stepOf(schedule));
        expect(day).toBe(Math.min(toParts(schedule.anchorOn).day, daysInMonth(year, month)));
      }),
      RUNS,
    );
  });

  it("clamping never drifts: after a short month the anchor's day comes back when it fits", () => {
    fc.assert(
      fc.property(anySchedule, (schedule) => {
        const anchorDay = toParts(schedule.anchorOn).day;
        for (let n = 0; n < 120; n++) {
          const { year, month, day } = toParts(dueDateAt(schedule, n)!);
          if (daysInMonth(year, month) >= anchorDay) expect(day).toBe(anchorDay);
        }
      }),
      { numRuns: 60 },
    );
  });

  it("due dates are strictly increasing and match the rule over long ranges", () => {
    fc.assert(
      fc.property(
        anySchedule,
        fc.integer({ min: -400, max: 400 }),
        fc.integer({ min: 0, max: 3_700 }),
        (schedule, offsetDays, lengthDays) => {
          const from = addDays(schedule.anchorOn, offsetDays);
          const to = addDays(from, lengthDays);
          const dates = dueDatesIn(schedule, { start: from, end: to });

          for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
          for (const date of dates) {
            expect(date >= from && date < to && date >= schedule.anchorOn).toBe(true);
          }
          // The same set as walking the rule from the anchor and filtering.
          const walked: CalendarDate[] = [];
          for (let n = 0; ; n++) {
            const due = dueDateAt(schedule, n)!;
            if (due >= to) break;
            if (due >= from) walked.push(due);
          }
          expect(dates).toEqual(walked);
        },
      ),
      RUNS,
    );
  });

  it("an end date cuts the sequence exactly after the last date on or before it", () => {
    fc.assert(
      fc.property(anySchedule, fc.integer({ min: 0, max: 30 }), (open, lastIndex) => {
        const endOn = dueDateAt(open, lastIndex)!;
        const schedule = { ...open, endOn };
        const everything = { start: open.anchorOn, end: addDays(endOn, 4_000) };
        const dates = dueDatesIn(schedule, everything);
        expect(dates).toHaveLength(lastIndex + 1);
        expect(dates.at(-1)).toBe(endOn);
      }),
      RUNS,
    );
  });

  it("a yearly Feb 29 anchor falls on Feb 29 exactly in leap years", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 400 }), (n) => {
        const { year, month, day } = toParts(dueDateAt(yearly("2000-02-29"), n)!);
        expect(month).toBe(2);
        expect(day).toBe(isLeapYear(year) ? 29 : 28);
      }),
      RUNS,
    );
  });
});
