import {
  calendarDate,
  daysInMonth,
  MAX_YEAR,
  toParts,
  type CalendarDate,
  type DateRange,
} from "@/domain/calendar-date";
import type { Money } from "@/domain/money";

/**
 * When a commitment falls due (docs/domain-model.md §8).
 *
 * Every due date is computed from the ORIGINAL anchor: the n-th date is the
 * anchor's day in the month `n × step` months after the anchor's month, clamped
 * to that month's last day. It is never derived from the previous due date, so
 * a 31st anchor gives Jan 31, Feb 28, Mar 31 — clamping cannot accumulate
 * drift. A yearly Feb 29 anchor is the same rule with a 12-month step: Feb 28
 * in common years, Feb 29 again in leap years.
 *
 * V1 schedules are monthly and yearly. Weekly schedules are deferred beyond V1
 * (roadmap §7), so they are not a frequency here.
 */
export const COMMITMENT_FREQUENCIES = ["monthly", "yearly"] as const;
export type CommitmentFrequency = (typeof COMMITMENT_FREQUENCIES)[number];

export interface CommitmentSchedule {
  readonly frequency: CommitmentFrequency;
  /** Every `interval` months or years (1 = every one). */
  readonly interval: number;
  /** The first due date; its day of month is the day every later date aims for. */
  readonly anchorOn: CalendarDate;
  /** The last day a due date may fall on (inclusive), or null for no end. */
  readonly endOn: CalendarDate | null;
}

/** The rule a commitment states: when it falls due, and how much is expected each time. */
export interface CommitmentRule {
  readonly schedule: CommitmentSchedule;
  /** A positive estimate; an actual payment may differ. */
  readonly expectedAmount: Money;
}

export type CommitmentRuleCode =
  "unsupported_frequency" | "invalid_interval" | "end_before_anchor" | "invalid_amount";

export interface CommitmentRuleViolation {
  readonly code: CommitmentRuleCode;
  readonly message: string;
}

const violation = (code: CommitmentRuleCode, message: string): CommitmentRuleViolation => ({
  code,
  message,
});

/** The first rule a commitment breaks, or undefined when it is valid. */
export function checkCommitmentRule(rule: CommitmentRule): CommitmentRuleViolation | undefined {
  const { schedule, expectedAmount } = rule;
  if (!(COMMITMENT_FREQUENCIES as readonly string[]).includes(schedule.frequency)) {
    return violation("unsupported_frequency", "A commitment repeats monthly or yearly.");
  }
  if (!Number.isInteger(schedule.interval) || schedule.interval < 1) {
    return violation(
      "invalid_interval",
      "A commitment repeats every whole number of months or years.",
    );
  }
  if (schedule.endOn !== null && schedule.endOn < schedule.anchorOn) {
    return violation("end_before_anchor", "A commitment cannot end before its first due date.");
  }
  if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0) {
    return violation("invalid_amount", "The expected amount must be more than zero.");
  }
  return undefined;
}

function assertValidSchedule(schedule: CommitmentSchedule): void {
  const broken = checkCommitmentRule({ schedule, expectedAmount: 1 as Money });
  if (broken) throw new RangeError(`Invalid commitment schedule: ${broken.message}`);
}

/** A date's month as a running count of months (year × 12 + month − 1). */
function monthIndexOf(date: CalendarDate): number {
  const { year, month } = toParts(date);
  return year * 12 + (month - 1);
}

/** Months between consecutive due dates. */
const stepMonths = (schedule: CommitmentSchedule): number =>
  schedule.interval * (schedule.frequency === "yearly" ? 12 : 1);

/**
 * The `index`-th due date (0 = the anchor), ignoring the end date. Null when
 * it would fall after the last supported calendar year.
 */
export function dueDateAt(schedule: CommitmentSchedule, index: number): CalendarDate | null {
  assertValidSchedule(schedule);
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError(`occurrence index ${index} is not a non-negative integer`);
  }
  const monthIndex = monthIndexOf(schedule.anchorOn) + index * stepMonths(schedule);
  const year = Math.floor(monthIndex / 12);
  if (year > MAX_YEAR) return null;
  const month = (monthIndex % 12) + 1;
  const anchorDay = toParts(schedule.anchorOn).day;
  return calendarDate(year, month, Math.min(anchorDay, daysInMonth(year, month)));
}

/**
 * Every due date inside a half-open range, in order, honouring the end date.
 * The range may start anywhere — before the anchor, or years after it — and
 * the dates are the same ones a walk from the anchor would produce.
 */
export function dueDatesIn(schedule: CommitmentSchedule, range: DateRange): CalendarDate[] {
  assertValidSchedule(schedule);
  const dates: CalendarDate[] = [];
  if (range.end <= range.start) return dates;

  // Start at the last index whose month is not after the range's first month.
  // A due date always lies in its own target month, so every earlier index
  // falls before the range and need not be generated.
  const monthsAfterAnchor = monthIndexOf(range.start) - monthIndexOf(schedule.anchorOn);
  let index = Math.max(0, Math.floor(monthsAfterAnchor / stepMonths(schedule)));

  for (;;) {
    const due = dueDateAt(schedule, index);
    if (due === null || due >= range.end) break;
    if (schedule.endOn !== null && due > schedule.endOn) break;
    if (due >= range.start) dates.push(due);
    index += 1;
  }
  return dates;
}
