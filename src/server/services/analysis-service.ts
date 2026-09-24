import { yearMonthOf, type CalendarDate, type YearMonth } from "@/domain/calendar-date";
import {
  cashFlowPeriod,
  selectableMonths,
  spendingComposition,
  summarizeCashFlow,
  type CashFlowPeriod,
  type CashFlowSummary,
  type CategorySpending,
  type SpendingComposition,
} from "@/domain/ledger/cash-flow";
import {
  comparisonPeriod,
  explainSpendingChange,
  type ComparisonPeriod,
  type SpendingChange,
} from "@/domain/ledger/month-over-month";
import type { Money } from "@/domain/money";
import type { ServiceContext } from "@/server/context";
import { getIncome, getSpendingByCategory } from "@/server/services/ledger-service";
import { getAccounts, getCategories } from "@/server/services/setup-service";

/**
 * Monthly analysis read models (roadmap Stage 5). Everything is derived on
 * read from the ledger's existing income and spending queries; nothing is
 * stored.
 */

export interface MonthlyCashFlow {
  readonly period: CashFlowPeriod;
  /** Every month that can be selected, newest first. */
  readonly months: readonly YearMonth[];
  readonly summary: CashFlowSummary;
  readonly composition: SpendingComposition;
  /** How spending changed against the comparison period; null when there is none. */
  readonly change: MonthOverMonth | null;
}

export interface MonthOverMonth {
  readonly comparison: ComparisonPeriod;
  readonly explanation: SpendingChange;
}

/**
 * Income, spending, what was left over, where the spending went, and how it
 * changed against the comparison period, for one month. `requestedMonth` is
 * untrusted input ("YYYY-MM" from the URL): anything that is not a selectable
 * month — malformed, in the future, or before the first account — falls back
 * to the current month.
 */
export async function getMonthlyCashFlow(
  ctx: ServiceContext,
  requestedMonth?: string,
): Promise<MonthlyCashFlow> {
  const today = ctx.clock.today();
  const accounts = await getAccounts(ctx);
  const earliest = accounts.reduce<CalendarDate | null>(
    (min, a) => (min === null || a.openedOn < min ? (a.openedOn as CalendarDate) : min),
    null,
  );
  const months = selectableMonths(earliest, today);
  const month = months.find((m) => m === requestedMonth) ?? yearMonthOf(today);
  const period = cashFlowPeriod(month, today);

  const comparison = comparisonPeriod(period, months);

  const [income, spendingByCategory, previousByCategory, categories] = await Promise.all([
    getIncome(ctx, period.range),
    getSpendingByCategory(ctx, period.range),
    comparison ? getSpendingByCategory(ctx, comparison.range) : null,
    getCategories(ctx),
  ]);
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const lines = (byCategory: Map<string, Money>): CategorySpending[] =>
    [...byCategory].map(([categoryId, amount]) => ({
      categoryId,
      name: names.get(categoryId) ?? categoryId,
      amount,
    }));
  const current = lines(spendingByCategory);
  const composition = spendingComposition(current);
  const change =
    comparison && previousByCategory
      ? {
          comparison,
          explanation: explainSpendingChange(current, lines(previousByCategory)),
        }
      : null;
  return {
    period,
    months,
    summary: summarizeCashFlow(income, composition.total),
    composition,
    change,
  };
}
