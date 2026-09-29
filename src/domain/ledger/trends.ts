import {
  addMonths,
  dayOfMonth,
  firstDayOf,
  monthRange,
  yearMonthOf,
  type CalendarDate,
  type DateRange,
  type YearMonth,
} from "@/domain/calendar-date";

/**
 * Trends (roadmap Stage 12): the shape of income, spending and what was left
 * over across complete months, and which categories moved spending between
 * the earlier and the recent half of that window. Pure functions over months;
 * the figures themselves are the ledger's existing income and spending.
 *
 * A partial month is never treated as a complete one: the current month is
 * Cash flow's, and a month an account was opened part-way through holds only
 * part of that month's money.
 */

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

export const TREND_LENGTHS = [6, 12] as const;
export type TrendLength = (typeof TREND_LENGTHS)[number];
export const DEFAULT_TREND_LENGTH: TrendLength = 6;

/** Fewer complete months than this is not yet a trend. */
export const MIN_TREND_MONTHS = 3;

/** `requested` is untrusted ("12" from the URL): anything that isn't an offered length is the default. */
export function trendLength(requested: unknown): TrendLength {
  return TREND_LENGTHS.find((l) => String(l) === requested) ?? DEFAULT_TREND_LENGTH;
}

/**
 * The first month the ledger describes completely: the earliest account's
 * opening month when it opened on the 1st, otherwise the month after. No
 * transaction predates its account, so nothing before the opening is missing
 * from a month that starts on or after it.
 */
export function firstCompleteMonth(earliestOpenedOn: CalendarDate): YearMonth {
  const month = yearMonthOf(earliestOpenedOn);
  return dayOfMonth(earliestOpenedOn) === 1 ? month : addMonths(month, 1);
}

/**
 * The months a trend of `length` covers, oldest first: the complete months
 * that end with the month before today's, at most `length` of them. Shorter
 * when the ledger has fewer complete months; empty with no accounts.
 */
export function trendMonths(
  earliestOpenedOn: CalendarDate | null,
  today: CalendarDate,
  length: TrendLength,
): YearMonth[] {
  if (earliestOpenedOn === null) return [];
  const last = addMonths(yearMonthOf(today), -1);
  const earliest = firstCompleteMonth(earliestOpenedOn);
  const months: YearMonth[] = [];
  for (let month = last; month >= earliest && months.length < length; month = addMonths(month, -1))
    months.unshift(month);
  return months;
}

/** Half-open: from the first day of the first month to the day after the last month. */
export function monthsRange(months: readonly YearMonth[]): DateRange {
  if (months.length === 0) throw new RangeError("A range needs at least one month");
  return { start: firstDayOf(months[0]!), end: monthRange(months[months.length - 1]!).end };
}

// ---------------------------------------------------------------------------
// Comparison halves
// ---------------------------------------------------------------------------

export interface TrendHalf {
  /** Oldest first. */
  readonly months: readonly YearMonth[];
  /** Half-open, covering exactly `months`. */
  readonly range: DateRange;
}

export interface TrendHalves {
  readonly earlier: TrendHalf;
  readonly recent: TrendHalf;
}

/**
 * The earlier and the recent half of the window, of equal length, so their
 * totals compare like for like without averaging. With an odd number of
 * months the middle month belongs to neither. Null when the window is not yet
 * a trend (fewer than MIN_TREND_MONTHS).
 */
export function comparisonHalves(months: readonly YearMonth[]): TrendHalves | null {
  if (months.length < MIN_TREND_MONTHS) return null;
  const size = Math.floor(months.length / 2);
  const half = (ms: readonly YearMonth[]): TrendHalf => ({ months: ms, range: monthsRange(ms) });
  return {
    earlier: half(months.slice(0, size)),
    recent: half(months.slice(months.length - size)),
  };
}
