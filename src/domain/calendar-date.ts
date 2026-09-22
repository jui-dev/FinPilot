import { parseError, parsed, type ParseResult } from "./result";

/**
 * A calendar date ("2026-09-22"): no time of day, no time zone
 * (docs/domain-model.md §4.2). Stored and compared as ISO text; arithmetic
 * uses integer day numbers, never JavaScript Date objects, so results cannot
 * depend on the machine's time zone or daylight-saving rules.
 */
declare const calendarDateBrand: unique symbol;
export type CalendarDate = string & { readonly [calendarDateBrand]: true };

/** A calendar month ("2026-09"). */
declare const yearMonthBrand: unique symbol;
export type YearMonth = string & { readonly [yearMonthBrand]: true };

/** Half-open date range [start, end): `end` is the first day NOT included. */
export interface DateRange {
  readonly start: CalendarDate;
  readonly end: CalendarDate;
}

export const MIN_YEAR = 1;
export const MAX_YEAR = 9999;

const pad = (value: number, width: number) => String(value).padStart(width, "0");

export const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function daysInMonth(year: number, month: number): number {
  assertYearMonth(year, month);
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1]!;
}

function assertYearMonth(year: number, month: number): void {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new RangeError(`year ${year} is outside ${MIN_YEAR}–${MAX_YEAR}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`month ${month} is outside 1–12`);
  }
}

// ---------------------------------------------------------------------------
// Construction and parsing
// ---------------------------------------------------------------------------

export function calendarDate(year: number, month: number, day: number): CalendarDate {
  const max = daysInMonth(year, month);
  if (!Number.isInteger(day) || day < 1 || day > max) {
    throw new RangeError(`day ${day} is outside 1–${max} for ${pad(year, 4)}-${pad(month, 2)}`);
  }
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as CalendarDate;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseCalendarDate(input: string): ParseResult<CalendarDate> {
  const match = ISO_DATE.exec(input);
  if (!match) return parseError(`"${input}" is not an ISO date (YYYY-MM-DD)`);
  try {
    return parsed(calendarDate(Number(match[1]), Number(match[2]), Number(match[3])));
  } catch (error) {
    return parseError(`"${input}" is not a real date: ${(error as Error).message}`);
  }
}

/** For trusted ISO text (fixtures, stored values). Throws on invalid input. */
export function calendarDateFromIso(input: string): CalendarDate {
  const result = parseCalendarDate(input);
  if (!result.ok) throw new RangeError(result.error);
  return result.value;
}

export function toParts(date: CalendarDate): { year: number; month: number; day: number } {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

export const dayOfMonth = (date: CalendarDate): number => toParts(date).day;

// ---------------------------------------------------------------------------
// Day arithmetic (proleptic Gregorian; days since 1970-01-01)
// Algorithms: H. Hinnant, "chrono-Compatible Low-Level Date Algorithms".
// ---------------------------------------------------------------------------

export function toEpochDay(date: CalendarDate): number {
  const { year, month, day } = toParts(date);
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

export function fromEpochDay(epochDay: number): CalendarDate {
  if (!Number.isSafeInteger(epochDay))
    throw new RangeError(`epoch day ${epochDay} is not an integer`);
  const z = epochDay + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return calendarDate(year, month, day);
}

export const addDays = (date: CalendarDate, days: number): CalendarDate =>
  fromEpochDay(toEpochDay(date) + days);

/** Signed number of days from `from` to `to` (0 when equal). */
export const daysBetween = (from: CalendarDate, to: CalendarDate): number =>
  toEpochDay(to) - toEpochDay(from);

/** ISO dates with 4-digit years sort correctly as text. */
export const compareDates = (a: CalendarDate, b: CalendarDate): -1 | 0 | 1 =>
  a < b ? -1 : a > b ? 1 : 0;

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

export function yearMonth(year: number, month: number): YearMonth {
  assertYearMonth(year, month);
  return `${pad(year, 4)}-${pad(month, 2)}` as YearMonth;
}

export const yearMonthOf = (date: CalendarDate): YearMonth => date.slice(0, 7) as YearMonth;

function yearMonthParts(value: YearMonth): { year: number; month: number } {
  return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) };
}

export function addMonths(value: YearMonth, months: number): YearMonth {
  const { year, month } = yearMonthParts(value);
  const index = year * 12 + (month - 1) + months;
  return yearMonth(Math.floor(index / 12), (index % 12) + 1);
}

export const firstDayOf = (value: YearMonth): CalendarDate => `${value}-01` as CalendarDate;

export function daysInYearMonth(value: YearMonth): number {
  const { year, month } = yearMonthParts(value);
  return daysInMonth(year, month);
}

/** The whole month as a half-open range [1st, 1st of next month). */
export function monthRange(value: YearMonth): DateRange {
  const start = firstDayOf(value);
  return { start, end: addDays(start, daysInYearMonth(value)) };
}

// ---------------------------------------------------------------------------
// Ranges and windows
// ---------------------------------------------------------------------------

export const rangeContains = (range: DateRange, date: CalendarDate): boolean =>
  range.start <= date && date < range.end;

export const rangeLength = (range: DateRange): number => daysBetween(range.start, range.end);

/** Days of the month elapsed so far, counting `today` (day 22 → 22). */
export const elapsedDaysInMonth = (today: CalendarDate): number => dayOfMonth(today);

/** Days of the month after `today` (Sep 22 → 8). */
export const remainingDaysInMonth = (today: CalendarDate): number =>
  daysInYearMonth(yearMonthOf(today)) - dayOfMonth(today);

/**
 * Like-for-like month-to-date comparison windows (docs/domain-model.md §11).
 * Current: [1st of this month, today]. Previous: the same number of days from
 * the 1st of the previous month, clamped to that month's length
 * (Mar 31 → all of February).
 */
export function likeForLikeWindows(today: CalendarDate): {
  current: DateRange;
  previous: DateRange;
} {
  const month = yearMonthOf(today);
  const previousMonth = addMonths(month, -1);
  const previousStart = firstDayOf(previousMonth);
  const previousLength = Math.min(dayOfMonth(today), daysInYearMonth(previousMonth));
  return {
    current: { start: firstDayOf(month), end: addDays(today, 1) },
    previous: { start: previousStart, end: addDays(previousStart, previousLength) },
  };
}
