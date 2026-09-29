import {
  addMonths,
  monthRange,
  parseCalendarDate,
  rangeContains,
  yearMonthOf,
  type CalendarDate,
  type DateRange,
  type YearMonth,
} from "@/domain/calendar-date";
import type { CalendarWeek } from "@/domain/calendar-weeks";
import { selectableMonths } from "@/domain/ledger/cash-flow";
import { add, ZERO, type Money } from "@/domain/money";

/**
 * The Calendar: when money moved, and when payments fall due. Pure rules over
 * figures the ledger and the commitment read models already derive; income
 * and spending keep Cash flow's meaning (docs/domain-model.md §4), so a day,
 * a week and a month always add up the same way.
 */

// ---------------------------------------------------------------------------
// Months and the selected day
// ---------------------------------------------------------------------------

/**
 * The months the Calendar can show, newest first: from the latest month that
 * holds scheduled payments (occurrences exist through `horizon`) back to the
 * earliest account's opening month. Nothing is shown beyond the horizon, so
 * no month implies that nothing will be due.
 */
export function calendarMonths(
  earliestOpenedOn: CalendarDate | null,
  today: CalendarDate,
  horizon: CalendarDate,
): YearMonth[] {
  const current = yearMonthOf(today);
  const future: YearMonth[] = [];
  for (let m = yearMonthOf(horizon); m > current; m = addMonths(m, -1)) future.push(m);
  return [...future, ...selectableMonths(earliestOpenedOn, today)];
}

/**
 * The day shown in detail. `requested` is untrusted ("YYYY-MM-DD" from the
 * URL): a real day of the month is kept; otherwise the current month shows
 * today and any other month shows no day (its month summary instead).
 */
export function selectedDay(
  requested: unknown,
  month: YearMonth,
  today: CalendarDate,
): CalendarDate | null {
  if (typeof requested === "string") {
    const parsed = parseCalendarDate(requested);
    if (parsed.ok && rangeContains(monthRange(month), parsed.value)) return parsed.value;
  }
  return yearMonthOf(today) === month ? today : null;
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export interface DayMoney {
  readonly income: Money;
  /** Expenses net of refunds. */
  readonly spending: Money;
}

export const NO_MONEY: DayMoney = { income: ZERO, spending: ZERO };

/** Σ of the days whose date lies in `range`. */
export function moneyOver(byDay: ReadonlyMap<CalendarDate, DayMoney>, range: DateRange): DayMoney {
  let income = ZERO;
  let spending = ZERO;
  for (const [day, m] of byDay) {
    if (!rangeContains(range, day)) continue;
    income = add(income, m.income);
    spending = add(spending, m.spending);
  }
  return { income, spending };
}

/** Each week's income and spending, over the week's explicit date range. */
export function weekTotals(
  byDay: ReadonlyMap<CalendarDate, DayMoney>,
  weeks: readonly CalendarWeek[],
): (DayMoney & { readonly range: DateRange })[] {
  return weeks.map((w) => ({ range: w.range, ...moneyOver(byDay, w.range) }));
}
