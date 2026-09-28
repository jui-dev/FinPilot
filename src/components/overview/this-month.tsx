import { ArrowRight } from "lucide-react";
import Link from "next/link";

import type { CashFlowPeriod, CashFlowSummary } from "@/domain/ledger/cash-flow";
import { formatMoney, type Money as MoneyValue } from "@/domain/money";

import { activityHref } from "../activity/links";
import { periodNote } from "../cash-flow/labels";
import { rangeLabel } from "../format";
import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";

/**
 * "How is this month going?" — Cash flow's outcome for the month so far, as a
 * statement: what came in, what went out, and what was left over. Came in and
 * Went out open the Activity rows behind them; the section leads to Cash flow.
 * No savings rate, no comparison and no chart: Cash flow and Attention own those.
 */
export function ThisMonth({
  summary,
  period,
}: {
  readonly summary: CashFlowSummary;
  readonly period: CashFlowPeriod;
}) {
  const { range } = period;
  return (
    <section aria-labelledby="overview-month" className="flex flex-col px-5 py-5 md:px-7 md:py-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="overview-month" className="text-heading font-bold text-navy">
          This month
        </h2>
        <p className="text-meta text-ink-2">{periodNote(period)}</p>
      </header>
      <dl className="mt-4 text-body">
        <Line
          term="Came in"
          amount={summary.income}
          label={`Came in, ${rangeLabel(range)}`}
          href={activityHref({ type: "income", range })}
        />
        {/* No type filter: Activity's Spent total is expenses net of refunds, exactly this figure. */}
        <Line
          term="Went out"
          amount={summary.spending}
          label={`Went out, ${rangeLabel(range)}`}
          href={activityHref({ range })}
        />
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-line pt-3">
          <dt className="font-semibold text-navy">Left over</dt>
          {/* A true minus when spending was more; never berry, since it is direction, not an error. */}
          <dd className="text-figure font-bold text-navy">
            <Money amount={summary.leftOver} />
          </dd>
        </div>
      </dl>
      <Link
        href="/cash-flow"
        className={cn(
          "mt-auto inline-flex min-h-8 items-center gap-1.5 self-start pt-4 text-meta font-medium text-ocean max-md:min-h-10",
          linkClass,
        )}
      >
        Where it went in Cash flow
        <ArrowRight aria-hidden className="size-3.5" />
      </Link>
    </section>
  );
}

/** One line of the statement; a non-zero amount opens the rows behind it. */
function Line({
  term,
  amount,
  label,
  href,
}: {
  readonly term: string;
  readonly amount: MoneyValue;
  /** What a screen reader hears before the amount ("Came in, 1–29 Sep 2026"). */
  readonly label: string;
  readonly href: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-ink-2">{term}</dt>
      <dd className="font-semibold text-ink">
        {amount !== 0 ? (
          <Link href={href} aria-label={`${label}: ${formatMoney(amount)}`} className={linkClass}>
            <Money amount={amount} />
          </Link>
        ) : (
          <Money amount={amount} />
        )}
      </dd>
    </div>
  );
}
