import {
  addDays,
  firstDayOf,
  monthRange,
  toEpochDay,
  type CalendarDate,
  type DateRange,
  type YearMonth,
} from "@/domain/calendar-date";

/**
 * Weeks of a calendar month. Which day a week starts on is a calendar
 * convention chosen by the caller (the Calendar shows Bangladesh's
 * Saturday-first week), never an accounting rule: nothing here knows about
 * money, and money over a week is always summed over the week's explicit
 * date range.
 */

export const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** 1970-01-01 was a Thursday. */
export const weekdayOf = (date: CalendarDate): Weekday =>
  WEEKDAYS[(((toEpochDay(date) + 4) % 7) + 7) % 7]!;

/** 0 for the week's first day through 6 for its last, under `weekStartsOn`. */
export const weekdayIndex = (date: CalendarDate, weekStartsOn: Weekday): number =>
  (WEEKDAYS.indexOf(weekdayOf(date)) - WEEKDAYS.indexOf(weekStartsOn) + 7) % 7;

export interface CalendarWeek {
  /** Half-open, clipped to the month: the first and last week may be short. */
  readonly range: DateRange;
  /** The month's days in this week, in order. */
  readonly days: readonly CalendarDate[];
}

/**
 * The month's weeks under `weekStartsOn`. Every day of the month is in
 * exactly one week, and the weeks' ranges run back to back from the 1st to
 * the day after the month's last day.
 */
export function monthWeeks(month: YearMonth, weekStartsOn: Weekday): CalendarWeek[] {
  const { end } = monthRange(month);
  const weeks: CalendarWeek[] = [];
  let days: CalendarDate[] = [];
  for (let day = firstDayOf(month); day < end; day = addDays(day, 1)) {
    if (days.length > 0 && weekdayIndex(day, weekStartsOn) === 0) {
      weeks.push({ range: { start: days[0]!, end: day }, days });
      days = [];
    }
    days.push(day);
  }
  weeks.push({ range: { start: days[0]!, end }, days });
  return weeks;
}
