import type { YearMonth } from "@/domain/calendar-date";

import { monthLabel } from "../format";

/** "Sep" for "2025-09". */
export const shortMonth = (month: YearMonth | string): string => monthLabel(month).slice(0, 3);

/** "Mar–May 2026", or "Sep 2025 – Feb 2026" across a year; one month is just "April 2026". */
export function monthSpan(months: readonly (YearMonth | string)[]): string {
  const first = months[0]!;
  const last = months[months.length - 1]!;
  if (first === last) return monthLabel(first);
  const [fy, ly] = [first.slice(0, 4), last.slice(0, 4)];
  return fy === ly
    ? `${shortMonth(first)}–${shortMonth(last)} ${ly}`
    : `${shortMonth(first)} ${fy} – ${shortMonth(last)} ${ly}`;
}

/** "3 months", "1 month". */
export const monthsCount = (n: number): string => (n === 1 ? "1 month" : `${n} months`);
