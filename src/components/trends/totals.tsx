import type { ReactNode } from "react";

import { formatPercent } from "@/domain/ledger/analytics";
import { summarizeCashFlow } from "@/domain/ledger/cash-flow";
import { sum, type Money as MoneyValue } from "@/domain/money";
import type { TrendMonth } from "@/server/services/analysis-service";

import { CARD, rateWidth } from "../cash-flow/labels";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { monthSpan, periodName } from "./describe";

/**
 * "How did these months add up?" (Trends). The window as one equation, the
 * same as Cash flow's month: Came in − Went out = Left over, with each side's
 * monthly average and the share of what came in that was left over. The only
 * place the window's totals appear; the months below carry the rest.
 */
export function TrendTotals({ months }: { readonly months: readonly TrendMonth[] }) {
  const income = sum(months.map((m) => m.income));
  const spending = sum(months.map((m) => m.spending));
  const { leftOver, savingsRate } = summarizeCashFlow(income, spending);
  const average = (total: MoneyValue) => Math.round(total / months.length) as MoneyValue;
  return (
    <section aria-labelledby="trends-totals" className={cn(CARD, "p-5 md:p-7")}>
      <h2 id="trends-totals" className="text-heading font-bold text-navy">
        {periodName(months.length)}
      </h2>
      <p className="mt-1 text-meta text-ink-2">
        {monthSpan(months.map((m) => m.month))}, added up.
      </p>

      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1.15fr)] lg:gap-2.5">
        <Side term="Came in" amount={income}>
          <Money amount={average(income)} sign="none" /> a month on average
        </Side>
        <Operator>−</Operator>
        <Side term="Went out" amount={spending}>
          <Money amount={average(spending)} sign="none" /> a month on average
        </Side>
        <Operator>=</Operator>
        <div className="min-w-0 rounded-[12px] bg-mist/35 px-4 py-3.5 shadow-[inset_0_0_0_1px_rgb(70_103_141/0.14)]">
          <dl>
            <div>
              <dt className="text-micro font-semibold tracking-[0.08em] text-ocean uppercase">
                Left over
              </dt>
              {/* A true minus when more went out; never berry: it is direction, not an error. */}
              <dd className="mt-1 text-figure font-bold whitespace-nowrap text-navy tabular-nums md:text-[2rem] md:leading-tight">
                <Money amount={leftOver} />
              </dd>
            </div>
            {savingsRate && (
              <div className="mt-2.5 flex items-baseline justify-between gap-3 text-meta">
                <dt className="text-ink-2">Of what came in</dt>
                <dd className="font-bold text-navy tabular-nums">{formatPercent(savingsRate)}</dd>
              </div>
            )}
          </dl>
          <span aria-hidden className="mt-1.5 block h-1.5 rounded-full bg-surface">
            <span
              className="block h-full rounded-full bg-navy"
              style={{ width: `${rateWidth(savingsRate) * 100}%` }}
            />
          </span>
        </div>
      </div>
    </section>
  );
}

function Side({
  term,
  amount,
  children,
}: {
  readonly term: string;
  readonly amount: MoneyValue;
  readonly children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[12px] bg-surface-subtle px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--color-line-soft)]">
      <dl>
        <div>
          <dt className="text-micro font-semibold tracking-[0.08em] text-ink-2 uppercase">
            {term}
          </dt>
          <dd className="mt-1 text-figure font-bold whitespace-nowrap text-navy tabular-nums md:text-[2rem] md:leading-tight">
            <Money amount={amount} />
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-meta text-ink-2">{children}</p>
    </div>
  );
}

/** The operator between two sides: a chip in the gap from 1024px, hidden when the sides stack. */
function Operator({ children }: { readonly children: ReactNode }) {
  return (
    <div aria-hidden className="grid place-items-center max-lg:hidden">
      <span className="grid size-7 place-items-center rounded-full bg-surface text-body font-bold text-ink-2 shadow-[0_0_0_1px_var(--color-line),0_2px_6px_rgb(31_56_90/0.08)]">
        {children}
      </span>
    </div>
  );
}
