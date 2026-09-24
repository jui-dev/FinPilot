import { addDays, type DateRange } from "@/domain/calendar-date";

/**
 * A link to the Activity rows behind a figure: one category over one period.
 * The URL carries the range inclusively (`from`, `to`); internally it is
 * half-open, so `to` is the day before `range.end`.
 */
export function activityHref({
  categoryId,
  range,
}: {
  readonly categoryId: string;
  readonly range: DateRange;
}): string {
  const params = new URLSearchParams({
    category: categoryId,
    from: range.start,
    to: addDays(range.end, -1),
  });
  return `/activity?${params.toString()}`;
}
