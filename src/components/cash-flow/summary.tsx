import { ArrowDownLeft, ArrowUpRight, ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

import type { DateRange } from "@/domain/calendar-date";
import { formatPercent, type Ratio } from "@/domain/ledger/analytics";
import type { CashFlowSummary } from "@/domain/ledger/cash-flow";
import type { Money as MoneyValue } from "@/domain/money";

import { activityHref } from "../activity/links";
import { rangeLabel } from "../format";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { CARD } from "./labels";

/**
 * One card, read left to right: the month's outcome (what was left over, and
 * the savings rate), then the two facts it comes from. Income and Spending
 * open the Activity rows behind them; each whole row is the target.
 */
export function Summary({
  summary,
  range,
}: {
  readonly summary: CashFlowSummary;
  readonly range: DateRange;
}) {
  return (
    <section
      aria-labelledby="cash-flow-period"
      className={cn(CARD, "grid overflow-clip md:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]")}
    >
      <LeftOver summary={summary} />
      {/* Phones: the two facts side by side under the outcome. md and up: stacked beside it. */}
      <div className="grid grid-cols-2 divide-x divide-line border-t border-line md:grid-cols-1 md:divide-x-0 md:divide-y md:border-t-0 md:border-l">
        <Fact
          term="Income"
          icon={ArrowDownLeft}
          amount={summary.income}
          sign="none"
          label={`Income, ${rangeLabel(range)}`}
          href={activityHref({ type: "income", range })}
        />
        {/* No type filter: Activity's Spent total is expenses net of refunds,
            exactly this figure; the other rows in the range are not counted. */}
        <Fact
          term="Spending"
          icon={ArrowUpRight}
          amount={summary.spending}
          sign="negative"
          label={`Spending, ${rangeLabel(range)}`}
          href={activityHref({ range })}
        />
      </div>
    </section>
  );
}

function LeftOver({ summary }: { readonly summary: CashFlowSummary }) {
  const { income, leftOver, savingsRate } = summary;
  return (
    <div className="bg-mist px-5 py-5 md:px-7 md:py-6">
      <dl className="flex items-start justify-between gap-x-6 gap-y-3">
        <div>
          <dt className="text-body font-semibold text-navy">Left over</dt>
          <dd className="mt-1 text-display font-bold text-navy">
            <Money amount={leftOver} />
          </dd>
          <dd className="mt-1 text-body text-ink-2">
            {income === 0 ? (
              "Income − spending"
            ) : leftOver < 0 ? (
              "Spending was more than came in"
            ) : (
              <>
                Of <Money amount={income} sign="none" className="font-semibold text-ink" /> that
                came in
              </>
            )}
          </dd>
        </div>
        <div className="shrink-0 text-right">
          <dt className="text-body text-ink-2">Savings rate</dt>
          <dd className="mt-1 text-figure font-bold text-navy">
            {savingsRate ? formatPercent(savingsRate) : "—"}
          </dd>
          {!savingsRate && <dd className="text-meta text-ink-2">No income this month</dd>}
        </div>
      </dl>
      {savingsRate && <IncomeSplit rate={savingsRate} />}
    </div>
  );
}

/**
 * Income as one thin bar, split into what was kept and what was spent. Both
 * widths come from the savings rate the card prints; the bar adds no figure of
 * its own, so it is hidden from assistive technology. Drawn only when the rate
 * is a real share of income (0–100%).
 */
function IncomeSplit({ rate }: { readonly rate: Ratio }) {
  const kept = rate.numerator / rate.denominator;
  if (!(kept >= 0 && kept <= 1)) return null;
  return (
    <div aria-hidden className="mt-5 flex items-center gap-3">
      <span className="text-meta font-medium text-navy">Kept</span>
      <span className="flex h-2 min-w-0 flex-1 gap-0.5 overflow-hidden rounded-full bg-surface">
        {kept > 0 && <span className="rounded-full bg-navy" style={{ flexGrow: kept }} />}
        {kept < 1 && <span className="rounded-full bg-tide" style={{ flexGrow: 1 - kept }} />}
      </span>
      <span className="text-meta text-ink-2">Spent</span>
    </div>
  );
}

/**
 * A supporting figure. When it is not zero the row opens the transactions
 * behind it: the link sits on the amount and stretches over the row.
 */
function Fact({
  term,
  icon: Icon,
  amount,
  sign,
  label,
  href,
}: {
  readonly term: string;
  readonly icon: LucideIcon;
  readonly amount: MoneyValue;
  readonly sign: "negative" | "none";
  /** What a screen reader hears before the amount ("Spending, 1–22 Sep 2026"). */
  readonly label: string;
  readonly href: string;
}) {
  const linked = amount !== 0;
  return (
    <dl className="min-w-0">
      <div
        className={cn(
          // Phones: label, amount, affordance stacked. md and up: a row, the
          // label and affordance on the left and the amount on the right.
          "relative flex h-full flex-col px-4 py-4 transition-colors md:grid md:grid-cols-[minmax(0,1fr)_auto] md:content-center md:items-center md:gap-x-4 md:px-6",
          linked &&
            "hover:bg-canvas has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-ocean",
        )}
      >
        <dt className="flex items-center gap-2 text-body font-semibold text-ink-2">
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-full bg-mist text-ocean"
          >
            <Icon className="size-4" strokeWidth={2} />
          </span>
          {term}
        </dt>
        <dd className="mt-2 text-figure font-bold text-navy md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0">
          {linked ? (
            <Link href={href} className="outline-none after:absolute after:inset-0">
              <span className="sr-only">{label}: </span>
              <Money amount={amount} sign={sign} />
            </Link>
          ) : (
            <Money amount={amount} sign={sign} />
          )}
        </dd>
        {linked && (
          <dd
            aria-hidden
            className="mt-1 flex items-center gap-0.5 text-body font-medium text-ocean md:col-start-1 md:row-start-2 md:pl-9"
          >
            Transactions
            <ChevronRight className="size-4" strokeWidth={2.25} />
          </dd>
        )}
      </div>
    </dl>
  );
}
