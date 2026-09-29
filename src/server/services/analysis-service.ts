import {
  monthRange,
  yearMonthOf,
  type CalendarDate,
  type DateRange,
  type YearMonth,
} from "@/domain/calendar-date";
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
import {
  comparisonHalves,
  trendLength,
  trendMonths,
  type TrendHalf,
  type TrendLength,
} from "@/domain/ledger/trends";
import type { Money } from "@/domain/money";
import type { ServiceContext } from "@/server/context";
import {
  getIncome,
  getSpendingByCategory,
  getTotalSpending,
} from "@/server/services/ledger-service";
import { getAccounts, getCategories } from "@/server/services/setup-service";

/**
 * Monthly analysis read models (roadmap Stages 5 and 12). Everything is
 * derived on read from the ledger's existing income and spending queries;
 * nothing is stored.
 */

/** The earliest opening date of any account: no transaction predates it. */
async function earliestOpenedOn(ctx: ServiceContext): Promise<CalendarDate | null> {
  const accounts = await getAccounts(ctx);
  return accounts.reduce<CalendarDate | null>(
    (min, a) => (min === null || a.openedOn < min ? (a.openedOn as CalendarDate) : min),
    null,
  );
}

/** Spending per category, named. An archived category keeps its name. */
async function categoryLines(
  ctx: ServiceContext,
): Promise<(byCategory: Map<string, Money>) => CategorySpending[]> {
  const names = new Map((await getCategories(ctx)).map((c) => [c.id, c.name]));
  return (byCategory) =>
    [...byCategory].map(([categoryId, amount]) => ({
      categoryId,
      name: names.get(categoryId) ?? categoryId,
      amount,
    }));
}

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
  const months = selectableMonths(await earliestOpenedOn(ctx), today);
  const month = months.find((m) => m === requestedMonth) ?? yearMonthOf(today);
  const period = cashFlowPeriod(month, today);

  const comparison = comparisonPeriod(period, months);

  const [income, spendingByCategory, previousByCategory, lines] = await Promise.all([
    getIncome(ctx, period.range),
    getSpendingByCategory(ctx, period.range),
    comparison ? getSpendingByCategory(ctx, comparison.range) : null,
    categoryLines(ctx),
  ]);
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

// ---------------------------------------------------------------------------
// Trends (Stage 12)
// ---------------------------------------------------------------------------

export interface TrendMonth {
  readonly month: YearMonth;
  /** The whole calendar month. */
  readonly range: DateRange;
  readonly income: Money;
  /** Expenses net of refunds: the same figure as Cash flow's for this month. */
  readonly spending: Money;
  /** income − spending; negative when more went out than came in. */
  readonly leftOver: Money;
}

export interface TrendChange {
  readonly earlier: TrendHalf;
  readonly recent: TrendHalf;
  /** The recent half's spending against the earlier half's, as exact totals. */
  readonly explanation: SpendingChange;
}

export interface Trends {
  readonly length: TrendLength;
  /**
   * Complete months, oldest first, ending with last month. Fewer than
   * `length` when the ledger has fewer complete months.
   */
  readonly months: readonly TrendMonth[];
  /** Which categories moved spending between the halves; null when the window is not yet a trend. */
  readonly change: TrendChange | null;
}

/**
 * Income, spending and what was left over across the last `requestedLength`
 * complete months, and how spending changed between the window's earlier and
 * recent halves. `requestedLength` is untrusted ("12" from the URL): anything
 * but an offered length is the default. The current month is never part of it.
 */
export async function getTrends(ctx: ServiceContext, requestedLength?: string): Promise<Trends> {
  const length = trendLength(requestedLength);
  const months = trendMonths(await earliestOpenedOn(ctx), ctx.clock.today(), length);
  const halves = comparisonHalves(months);

  const [figures, earlierByCategory, recentByCategory, lines] = await Promise.all([
    Promise.all(
      months.map(async (month) => {
        const range = monthRange(month);
        const [income, spending] = await Promise.all([
          getIncome(ctx, range),
          getTotalSpending(ctx, range),
        ]);
        const { leftOver } = summarizeCashFlow(income, spending);
        return { month, range, income, spending, leftOver };
      }),
    ),
    halves ? getSpendingByCategory(ctx, halves.earlier.range) : null,
    halves ? getSpendingByCategory(ctx, halves.recent.range) : null,
    categoryLines(ctx),
  ]);
  const change =
    halves && earlierByCategory && recentByCategory
      ? {
          ...halves,
          explanation: explainSpendingChange(lines(recentByCategory), lines(earlierByCategory)),
        }
      : null;
  return { length, months: figures, change };
}
