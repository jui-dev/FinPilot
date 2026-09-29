import {
  addDays,
  addMonths,
  firstDayOf,
  monthRange,
  yearMonthOf,
  type CalendarDate,
  type DateRange,
  type YearMonth,
} from "@/domain/calendar-date";
import { savingsRate, type Ratio } from "@/domain/ledger/analytics";
import { add, subtract, sum, ZERO, type Money } from "@/domain/money";

/**
 * A month's cash flow: what came in, what was spent, and where it went
 * (roadmap Stage 5a). Pure functions over figures the ledger already derives;
 * spending is always expenses net of refunds, and transfers, opening balances
 * and adjustments are never part of income or spending (docs/domain-model.md §4).
 */

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

/** The current month is month-to-date; any earlier month is the whole calendar month. */
export type CashFlowPeriodKind = "month_to_date" | "complete";

export interface CashFlowPeriod {
  readonly month: YearMonth;
  readonly kind: CashFlowPeriodKind;
  /** Half-open: the month-to-date range ends the day after today. */
  readonly range: DateRange;
}

export function cashFlowPeriod(month: YearMonth, today: CalendarDate): CashFlowPeriod {
  const current = yearMonthOf(today);
  if (month > current) throw new RangeError(`${month} is after the current month ${current}`);
  if (month === current) {
    return {
      month,
      kind: "month_to_date",
      range: { start: firstDayOf(month), end: addDays(today, 1) },
    };
  }
  return { month, kind: "complete", range: monthRange(month) };
}

/**
 * Months that can be looked at, newest first: every month from the earliest
 * account's opening month through the current month, including quiet months
 * (nothing happening is still an answer). No transaction can predate its
 * account, so no activity falls outside this list. With no accounts, only the
 * current month.
 */
export function selectableMonths(
  earliestOpenedOn: CalendarDate | null,
  today: CalendarDate,
): YearMonth[] {
  const current = yearMonthOf(today);
  const first =
    earliestOpenedOn && yearMonthOf(earliestOpenedOn) < current
      ? yearMonthOf(earliestOpenedOn)
      : current;
  const months: YearMonth[] = [];
  for (let month = current; month >= first; month = addMonths(month, -1)) months.push(month);
  return months;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface CashFlowSummary {
  readonly income: Money;
  /** Expenses net of refunds. */
  readonly spending: Money;
  /**
   * income − spending. Not a change in balances or net worth: transfers,
   * opening balances and reconciliation adjustments are outside it.
   */
  readonly leftOver: Money;
  /** leftOver / income; null when there is no income. */
  readonly savingsRate: Ratio | null;
}

export function summarizeCashFlow(income: Money, spending: Money): CashFlowSummary {
  return {
    income,
    spending,
    leftOver: subtract(income, spending),
    savingsRate: savingsRate(income, spending),
  };
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/** Income from one income category in the period: where money came from. Always > 0. */
export interface IncomeSource {
  readonly categoryId: string;
  readonly name: string;
  readonly amount: Money;
}

export interface CategorySpending {
  readonly categoryId: string;
  readonly name: string;
  /** Expenses net of refunds in the period; negative when refunds exceed expenses. */
  readonly amount: Money;
}

export interface CompositionLine extends CategorySpending {
  /** amount / Σ non-negative amounts; null when that sum is zero or the line is negative. */
  readonly share: Ratio | null;
}

export interface SpendingComposition {
  /** Σ of every line: the period's spending. */
  readonly total: Money;
  /** Lines with amount ≥ 0, largest first. Their shares describe the spending. */
  readonly spent: readonly CompositionLine[];
  /**
   * Lines whose refunds exceed their expenses, most refunded first. Kept out
   * of the share denominator, so shares never exceed 100% or go negative.
   */
  readonly refundedMoreThanSpent: readonly CompositionLine[];
}

/** Code-point order of the lower-cased name: independent of the machine's locale. */
export const byName = (a: { readonly name: string }, b: { readonly name: string }): number => {
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  if (x !== y) return x < y ? -1 : 1;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
};

export function spendingComposition(lines: readonly CategorySpending[]): SpendingComposition {
  const spent = lines.filter((l) => l.amount >= 0);
  const refunded = lines.filter((l) => l.amount < 0);
  const denominator = spent.reduce<Money>((acc, l) => add(acc, l.amount), ZERO);
  return {
    total: sum(lines.map((l) => l.amount)),
    spent: [...spent]
      .sort((a, b) => b.amount - a.amount || byName(a, b))
      .map((l) => ({
        ...l,
        share: denominator > 0 ? { numerator: l.amount, denominator } : null,
      })),
    refundedMoreThanSpent: [...refunded]
      .sort((a, b) => a.amount - b.amount || byName(a, b))
      .map((l) => ({ ...l, share: null })),
  };
}
