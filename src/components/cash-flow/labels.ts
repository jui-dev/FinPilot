import { addDays, dayOfMonth } from "@/domain/calendar-date";
import type { Ratio } from "@/domain/ledger/analytics";
import type { CashFlowPeriod, CompositionLine } from "@/domain/ledger/cash-flow";
import { sum, type Money } from "@/domain/money";
import type { ComparisonPeriod } from "@/domain/ledger/month-over-month";

import { monthLabel, rangeLabel, shortDate } from "../format";

/** A Cash flow card: white, a whisper of an edge, a soft lift (as on Available). */
export const CARD = "rounded-panel border border-line-soft bg-surface shadow-card";

/** A domain ratio as a fraction of 1: presentation only, the percentage stays the truth. */
export const fraction = (ratio: Ratio) => ratio.numerator / ratio.denominator;

/**
 * The savings rate restated per ৳100 that came in ("about ৳19"), rounded to
 * whole taka for the sentence. Zero when there is no rate or nothing was kept.
 */
export function perHundred(rate: Ratio | null): Money {
  if (!rate || rate.numerator <= 0) return 0 as Money;
  return (Math.round(fraction(rate) * 100) * 100) as Money;
}

/** How far the savings-rate bar reaches: the rate, clamped to 0–1. */
export const rateWidth = (rate: Ratio | null) =>
  rate ? Math.min(Math.max(fraction(rate), 0), 1) : 0;

/**
 * The largest categories and their combined share of what was spent, for the
 * sentence under the ring ("Housing, Health and Groceries take 70%"). The
 * share is a ratio of the lines' own amounts, so it matches their shares.
 */
export function topShare(
  spent: readonly CompositionLine[],
  count: number,
): { readonly names: readonly string[]; readonly share: Ratio; readonly others: number } | null {
  const positive = spent.filter((l) => l.amount > 0);
  const total = sum(positive.map((l) => l.amount));
  if (positive.length < 2 || total <= 0) return null;
  const top = positive.slice(0, count);
  return {
    names: top.map((l) => l.name),
    share: { numerator: sum(top.map((l) => l.amount)), denominator: total },
    others: positive.length - top.length,
  };
}

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
