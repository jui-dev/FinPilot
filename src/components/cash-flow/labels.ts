import { addDays, dayOfMonth } from "@/domain/calendar-date";
import type { CashFlowPeriod } from "@/domain/ledger/cash-flow";
import type { ComparisonPeriod } from "@/domain/ledger/month-over-month";

import { monthLabel, rangeLabel, shortDate } from "../format";

/** A Cash flow card: white, hairline edge, a soft lift. */
export const CARD = "rounded-panel border border-line bg-surface shadow-card";

/** "1–24 Sep, so far" for the running month; "Full month" for a finished one. */
export function periodNote(period: CashFlowPeriod): string {
  if (period.kind === "complete") return "Full month";
  const last = addDays(period.range.end, -1);
  const first = dayOfMonth(period.range.start);
  return first === dayOfMonth(last)
    ? `${shortDate(last)}, so far`
    : `${first}–${shortDate(last)}, so far`;
}

/** "vs 1–22 Aug" for the same days of the previous month; "vs August 2026" for a whole month. */
export function comparisonNote(comparison: ComparisonPeriod): string {
  if (comparison.kind === "complete") return `vs ${monthLabel(comparison.month)}`;
  const last = addDays(comparison.range.end, -1);
  const first = dayOfMonth(comparison.range.start);
  return first === dayOfMonth(last) ? `vs ${shortDate(last)}` : `vs ${first}–${shortDate(last)}`;
}

/** What a compared period is called on its tile: "August 2026", or "1–27 Aug 2026". */
export function comparedPeriodName(
  kind: "complete" | "month_to_date" | "same_days",
  month: string,
  range: CashFlowPeriod["range"],
): string {
  return kind === "complete" ? monthLabel(month) : rangeLabel(range);
}
