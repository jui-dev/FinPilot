import {
  addDays,
  addMonths,
  likeForLikeWindows,
  monthRange,
  type CalendarDate,
  type DateRange,
  type YearMonth,
} from "@/domain/calendar-date";
import type { Ratio } from "@/domain/ledger/analytics";
import { byName, type CashFlowPeriod, type CategorySpending } from "@/domain/ledger/cash-flow";
import { abs, add, fromMajor, negate, subtract, sum, ZERO, type Money } from "@/domain/money";

/**
 * Month-over-month explanation (roadmap Stage 5b, docs/domain-model.md §11):
 * how spending changed against a comparison period, and which categories
 * account for the change. Pure functions over per-category spending the
 * ledger already derives (expenses net of refunds).
 */

// ---------------------------------------------------------------------------
// Comparison period
// ---------------------------------------------------------------------------

/**
 * "same_days": the month to date against the same days of the previous month.
 * "complete": a complete month against the whole previous calendar month.
 */
export type ComparisonKind = "same_days" | "complete";

export interface ComparisonPeriod {
  readonly month: YearMonth;
  readonly kind: ComparisonKind;
  /** Half-open. */
  readonly range: DateRange;
}

/**
 * The period `period` is compared with (docs/domain-model.md §11, §18):
 * - month to date → the same days of the previous month, clamped to that
 *   month's length (the like-for-like window);
 * - a complete month → the whole previous calendar month.
 *
 * Null when the previous month is not selectable (it predates every account):
 * comparing with an empty month would describe everything as an increase.
 */
export function comparisonPeriod(
  period: CashFlowPeriod,
  selectable: readonly YearMonth[],
): ComparisonPeriod | null {
  const month = addMonths(period.month, -1);
  if (!selectable.includes(month)) return null;
  if (period.kind === "month_to_date") {
    const today: CalendarDate = addDays(period.range.end, -1);
    return { month, kind: "same_days", range: likeForLikeWindows(today).previous };
  }
  return { month, kind: "complete", range: monthRange(month) };
}

// ---------------------------------------------------------------------------
// Materiality
// ---------------------------------------------------------------------------

/** The fixed part of the materiality threshold: ৳500. */
export const MATERIALITY_FLOOR: Money = fromMajor(500);

/**
 * A category change is material when |Δ| ≥ max(৳500, 10% × |previous|)
 * (docs/domain-model.md §11, §18). The magnitude keeps a refund-heavy
 * (negative) previous amount from lowering the threshold. Exact integer
 * comparison: 10·|Δ| ≥ |previous|, in BigInt so it cannot overflow.
 */
export function isMaterialChange(change: Money, previous: Money): boolean {
  const magnitude = abs(change);
  return magnitude >= MATERIALITY_FLOOR && BigInt(magnitude) * 10n >= BigInt(abs(previous));
}

// ---------------------------------------------------------------------------
// Explanation
// ---------------------------------------------------------------------------

export interface CategoryChange {
  readonly categoryId: string;
  readonly name: string;
  readonly previous: Money;
  readonly current: Money;
  /** current − previous: positive when more was spent. */
  readonly change: Money;
  readonly material: boolean;
  /** change / gross increases, for increases only; null otherwise. */
  readonly shareOfIncreases: Ratio | null;
}

export interface SpendingChange {
  readonly previousTotal: Money;
  readonly currentTotal: Money;
  /** currentTotal − previousTotal = Σ change = grossIncreases − grossDecreases. */
  readonly net: Money;
  /** Σ of the positive changes: the denominator of every share. */
  readonly grossIncreases: Money;
  /** Σ of the negative changes, as a positive amount: the offsets. */
  readonly grossDecreases: Money;
  /** Every change > 0, largest first; material or not. */
  readonly increases: readonly CategoryChange[];
  /** Every change < 0 (offsets), largest decrease first; material or not. */
  readonly offsets: readonly CategoryChange[];
  /** Categories spent in either period with no change, by name. */
  readonly unchanged: readonly CategoryChange[];
  /**
   * The non-zero changes that are not material, grouped: how many, and their
   * signed sum. Σ material changes + smallerChanges.net = net, exactly.
   */
  readonly smallerChanges: { readonly count: number; readonly net: Money };
}

/**
 * Explains the change in spending between two periods, category by category.
 * A category missing from one period counts as zero there. Shares are over
 * gross increases, never the net change: offsets would otherwise push a
 * category's share past 100% (docs/acceptance-scenarios.md A-22).
 */
export function explainSpendingChange(
  current: readonly CategorySpending[],
  previous: readonly CategorySpending[],
): SpendingChange {
  const lines = new Map<string, { name: string; previous: Money; current: Money }>();
  for (const l of previous)
    lines.set(l.categoryId, { name: l.name, previous: l.amount, current: ZERO });
  for (const l of current) {
    const line = lines.get(l.categoryId);
    if (line) line.current = l.amount;
    else lines.set(l.categoryId, { name: l.name, previous: ZERO, current: l.amount });
  }

  const deltas = [...lines].map(([categoryId, l]) => ({
    categoryId,
    ...l,
    change: subtract(l.current, l.previous),
  }));
  const grossIncreases = sum(deltas.filter((l) => l.change > 0).map((l) => l.change));
  const grossDecreases = negate(sum(deltas.filter((l) => l.change < 0).map((l) => l.change)));

  const changes: CategoryChange[] = deltas.map((l) => ({
    categoryId: l.categoryId,
    name: l.name,
    previous: l.previous,
    current: l.current,
    change: l.change,
    material: isMaterialChange(l.change, l.previous),
    shareOfIncreases: l.change > 0 ? { numerator: l.change, denominator: grossIncreases } : null,
  }));
  const smaller = changes.filter((l) => l.change !== 0 && !l.material);
  const previousTotal = sum(previous.map((l) => l.amount));
  const currentTotal = sum(current.map((l) => l.amount));

  return {
    previousTotal,
    currentTotal,
    net: subtract(currentTotal, previousTotal),
    grossIncreases,
    grossDecreases,
    increases: changes
      .filter((l) => l.change > 0)
      .sort((a, b) => b.change - a.change || byName(a, b)),
    offsets: changes
      .filter((l) => l.change < 0)
      .sort((a, b) => a.change - b.change || byName(a, b)),
    unchanged: changes.filter((l) => l.change === 0).sort(byName),
    smallerChanges: {
      count: smaller.length,
      net: smaller.reduce<Money>((acc, l) => add(acc, l.change), ZERO),
    },
  };
}
