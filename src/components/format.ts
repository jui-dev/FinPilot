import {
  addDays,
  toEpochDay,
  toParts,
  type CalendarDate,
  type DateRange,
  type YearMonth,
} from "@/domain/calendar-date";

/**
 * Presentation of calendar dates, computed from the date itself (no JS Date,
 * so no time-zone drift). English labels; the domain stays locale-free.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 1970-01-01 was a Thursday. */
export const weekdayOf = (date: CalendarDate): string =>
  WEEKDAYS[(((toEpochDay(date) + 4) % 7) + 7) % 7]!;

/** "22 Sep", or "22 Sep 2025" when the year differs from today's. */
export function shortDate(date: CalendarDate, today?: CalendarDate): string {
  const { year, month, day } = toParts(date);
  const sameYear = today ? toParts(today).year === year : false;
  return `${day} ${MONTHS[month - 1]}${sameYear ? "" : ` ${year}`}`;
}

/** "Tue, 22 Sep 2026". */
export function longDate(date: CalendarDate): string {
  const { year, month, day } = toParts(date);
  return `${weekdayOf(date)}, ${day} ${MONTHS[month - 1]} ${year}`;
}

/** "Today", "Yesterday", or "Mon, 21 Sep" (with the year when it isn't this year). */
export function dayLabel(date: CalendarDate, today: CalendarDate): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return `${weekdayOf(date)}, ${shortDate(date, today)}`;
}

/** "September 2026". */
export function monthLabel(value: YearMonth | string): string {
  const [year, month] = value.split("-").map(Number);
  return `${MONTHS_LONG[(month ?? 1) - 1]} ${year}`;
}

/** "1–22 Aug 2026", "30 Aug – 5 Sep 2026", "1 Dec 2025 – 3 Jan 2026": a half-open range, shown inclusively. */
export function rangeLabel(range: DateRange): string {
  const first = toParts(range.start);
  const last = toParts(addDays(range.end, -1));
  const end = `${last.day} ${MONTHS[last.month - 1]} ${last.year}`;
  if (first.year !== last.year) return `${shortDate(range.start)} – ${end}`;
  if (first.month !== last.month) return `${first.day} ${MONTHS[first.month - 1]} – ${end}`;
  return first.day === last.day ? end : `${first.day}–${end}`;
}
