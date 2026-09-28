import { daysBetween, toParts, type CalendarDate } from "@/domain/calendar-date";

import { shortDate } from "../format";
import type { PendingTiming } from "@/domain/commitments/occurrences";
import type { CommitmentFrequency } from "@/domain/commitments/schedule";

/**
 * Commitments in plain language. The schedule's mechanics (anchors, clamping,
 * generation boundaries) never reach the page: a person reads "Monthly on the
 * 31st", and the domain places it on the last day of shorter months.
 */

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd, 23rd … 31st. */
export function ordinal(day: number): string {
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const last = day % 10;
  const suffix = teen ? "th" : last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th";
  return `${day}${suffix}`;
}

/** A yearly schedule on 29 February, which falls on 28 February in years without one. */
export const isLeapDay = (date: CalendarDate): boolean => {
  const { month, day } = toParts(date);
  return month === 2 && day === 29;
};

/** Said wherever a leap-day schedule is described, so the wording stays true every year. */
export const LEAP_DAY_NOTE = "28 February in years without a 29th";

/**
 * "Monthly on the 1st", "Every 3 months on the 15th", "Yearly on 10 January",
 * "Every 2 years on 29 February (28 February in years without a 29th)". The
 * day comes from the first due date.
 */
export function describeRecurrence(schedule: {
  readonly frequency: CommitmentFrequency;
  readonly interval: number;
  readonly anchorOn: CalendarDate;
}): string {
  const { month, day } = toParts(schedule.anchorOn);
  const { frequency, interval } = schedule;
  if (frequency === "monthly") {
    return interval === 1
      ? `Monthly on the ${ordinal(day)}`
      : `Every ${interval} months on the ${ordinal(day)}`;
  }
  const date = `${day} ${MONTHS_LONG[month - 1]}`;
  const text = interval === 1 ? `Yearly on ${date}` : `Every ${interval} years on ${date}`;
  return isLeapDay(schedule.anchorOn) ? `${text} (${LEAP_DAY_NOTE})` : text;
}

/**
 * Occurrences are known only through the forecast window (today + 60 days),
 * so "nothing in the window" is said with its bound: a yearly commitment may
 * well fall due after it.
 */
export const noneThrough = (through: CalendarDate, today: CalendarDate) =>
  `None through ${shortDate(through, today)}`;

/**
 * Where a rule stands in time, for its row: not started, next due (or, when
 * the next one lies beyond the window, "Next after …"), and until when. Null
 * when it has ended, or when there is nothing to say.
 */
export function ruleTiming(
  rule: {
    readonly anchorOn: CalendarDate;
    readonly endOn: CalendarDate | null;
    /** The next unsettled occurrence due today or later, inside the window. */
    readonly nextDue: CalendarDate | null;
  },
  today: CalendarDate,
  through: CalendarDate,
): string | null {
  if (ruleEnded(rule, today)) return null;
  // Past the window only if the rule can still fall due after it.
  const beyond = rule.endOn === null || rule.endOn > through;
  const parts = [
    rule.anchorOn > today ? `Starts ${shortDate(rule.anchorOn, today)}` : null,
    rule.anchorOn <= today && rule.nextDue ? `Next ${shortDate(rule.nextDue, today)}` : null,
    rule.anchorOn <= today && !rule.nextDue && beyond
      ? `Next after ${shortDate(through, today)}`
      : null,
    rule.endOn ? `until ${shortDate(rule.endOn, today)}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** A rule whose last due date has passed with nothing left to settle. */
export const ruleEnded = (
  rule: { readonly endOn: CalendarDate | null; readonly nextDue: CalendarDate | null },
  today: CalendarDate,
) => rule.endOn !== null && rule.nextDue === null && rule.endOn < today;

/** "3 days overdue", "Due today", "Due tomorrow", "In 12 days". */
export function timingPhrase(dueOn: CalendarDate, today: CalendarDate, timing: PendingTiming) {
  const days = daysBetween(today, dueOn);
  if (timing === "due_today") return "Due today";
  if (timing === "overdue") return `${-days} ${-days === 1 ? "day" : "days"} overdue`;
  return days === 1 ? "Due tomorrow" : `In ${days} days`;
}

export const pluralPayments = (count: number) => `${count} ${count === 1 ? "payment" : "payments"}`;
