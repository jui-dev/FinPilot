import { describe, expect, it } from "vitest";

import {
  describeRecurrence,
  isLeapDay,
  noneThrough,
  ordinal,
  pluralPayments,
  ruleEnded,
  ruleTiming,
  timingPhrase,
} from "@/components/commitments/describe";
import { calendarDateFromIso as d } from "@/domain/calendar-date";

describe("wording beyond the forecast window (today + 60 days)", () => {
  const today = d("2026-09-28");
  const through = d("2026-11-27");

  it("says nothing is due through the window, never that nothing is scheduled", () => {
    expect(noneThrough(through, today)).toBe("None through 27 Nov");
  });

  it("gives a rule whose next one lies beyond the window 'Next after', not silence", () => {
    // A yearly commitment next due 15 Dec: nothing inside the window.
    expect(
      ruleTiming({ anchorOn: d("2025-12-15"), endOn: null, nextDue: null }, today, through),
    ).toBe("Next after 27 Nov");
    expect(
      ruleTiming(
        { anchorOn: d("2025-12-15"), endOn: d("2027-12-31"), nextDue: null },
        today,
        through,
      ),
    ).toBe("Next after 27 Nov, until 31 Dec 2027");
  });

  it("does not promise a later one when the rule ends inside the window", () => {
    expect(
      ruleTiming(
        { anchorOn: d("2026-08-10"), endOn: d("2026-10-10"), nextDue: null },
        today,
        through,
      ),
    ).toBe("until 10 Oct");
  });

  it("keeps the known next date, a future start, and an ended rule as they were", () => {
    expect(
      ruleTiming(
        { anchorOn: d("2026-08-01"), endOn: null, nextDue: d("2026-10-01") },
        today,
        through,
      ),
    ).toBe("Next 1 Oct");
    expect(
      ruleTiming({ anchorOn: d("2027-06-01"), endOn: null, nextDue: null }, today, through),
    ).toBe("Starts 1 Jun 2027");
    const ended = { anchorOn: d("2026-07-01"), endOn: d("2026-09-01"), nextDue: null };
    expect(ruleEnded(ended, today)).toBe(true);
    expect(ruleTiming(ended, today, through)).toBeNull();
  });
});

describe("leap-day schedules", () => {
  it("recognises 29 February only", () => {
    expect(isLeapDay(d("2028-02-29"))).toBe(true);
    expect(isLeapDay(d("2027-02-28"))).toBe(false);
  });

  it("says a yearly 29 February falls on 28 February in other years", () => {
    expect(
      describeRecurrence({ frequency: "yearly", interval: 1, anchorOn: d("2028-02-29") }),
    ).toBe("Yearly on 29 February (28 February in years without a 29th)");
  });
});

describe("ordinal", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [30, "30th"],
    [31, "31st"],
  ])("%i → %s", (day, text) => {
    expect(ordinal(day)).toBe(text);
  });
});

describe("describeRecurrence", () => {
  it("reads monthly and yearly rules in plain language", () => {
    expect(
      describeRecurrence({ frequency: "monthly", interval: 1, anchorOn: d("2026-08-01") }),
    ).toBe("Monthly on the 1st");
    expect(
      describeRecurrence({ frequency: "monthly", interval: 3, anchorOn: d("2026-07-15") }),
    ).toBe("Every 3 months on the 15th");
    expect(
      describeRecurrence({ frequency: "yearly", interval: 1, anchorOn: d("2027-01-10") }),
    ).toBe("Yearly on 10 January");
    expect(
      describeRecurrence({ frequency: "yearly", interval: 2, anchorOn: d("2028-02-29") }),
    ).toBe("Every 2 years on 29 February (28 February in years without a 29th)");
  });

  it("keeps the anchor's day, which the schedule clamps in shorter months", () => {
    expect(
      describeRecurrence({ frequency: "monthly", interval: 1, anchorOn: d("2026-01-31") }),
    ).toBe("Monthly on the 31st");
  });
});

describe("timingPhrase", () => {
  const today = d("2026-09-22");
  it("says how far a pending occurrence is from today", () => {
    expect(timingPhrase(d("2026-09-21"), today, "overdue")).toBe("1 day overdue");
    expect(timingPhrase(d("2026-09-01"), today, "overdue")).toBe("21 days overdue");
    expect(timingPhrase(today, today, "due_today")).toBe("Due today");
    expect(timingPhrase(d("2026-09-23"), today, "upcoming")).toBe("Due tomorrow");
    expect(timingPhrase(d("2026-09-25"), today, "upcoming")).toBe("In 3 days");
  });

  it("counts payments", () => {
    expect(pluralPayments(1)).toBe("1 payment");
    expect(pluralPayments(3)).toBe("3 payments");
  });
});
