import {
  addDays,
  dayOfMonth,
  monthRange,
  yearMonthOf,
  type DateRange,
  type YearMonth,
} from "@/domain/calendar-date";
import type { ActivityTypeFilter } from "@/server/services/activity-service";

/**
 * A link to the Activity rows behind a figure: an optional category, type or
 * account over one period. The URL carries the range inclusively (`from`,
 * `to`); internally it is half-open, so `to` is the day before `range.end`.
 */
export function activityHref({
  categoryId,
  type,
  accountId,
  range,
}: {
  readonly categoryId?: string;
  readonly type?: ActivityTypeFilter;
  readonly accountId?: string;
  readonly range: DateRange;
}): string {
  const params = new URLSearchParams();
  if (accountId) params.set("account", accountId);
  if (categoryId) params.set("category", categoryId);
  if (type) params.set("type", type);
  params.set("from", range.start);
  params.set("to", addDays(range.end, -1));
  return `/activity?${params.toString()}`;
}

/** The current month lives at the bare path; earlier months carry ?month=YYYY-MM. */
export const cashFlowHref = (month: YearMonth, currentMonth: YearMonth): string =>
  month === currentMonth ? "/cash-flow" : `/cash-flow?month=${month}`;

/**
 * The month a range covers when it has the shape of a Cash flow period: it
 * starts on the 1st and ends within the same month (a month to date, the same
 * days of a month, or the whole month). Null for any other range.
 */
export function cashFlowMonthOf(range: DateRange): YearMonth | null {
  if (dayOfMonth(range.start) !== 1) return null;
  const month = yearMonthOf(range.start);
  return range.end <= monthRange(month).end ? month : null;
}
