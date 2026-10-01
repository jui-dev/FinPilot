import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { DateRange } from "@/domain/calendar-date";
import { formatPercent } from "@/domain/ledger/analytics";
import type { CashFlowSummary, IncomeSource, SpendingComposition } from "@/domain/ledger/cash-flow";

import { activityHref } from "../activity/links";
import { rangeLabel } from "../format";
import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { CARD, perHundred, rateWidth } from "./labels";

/**
 * The month as one equation, read left to right: what came in (and from
 * where), what went out (and its largest part), and what was left over, with
 * the savings rate. Each side opens the Activity rows behind it. Every figure
 * is the domain's; the rate bar and "per ৳100" only restate the savings rate.
 */
export function Summary({
  summary,
  sources,
  composition,
  range,
  title,
}: {
  /** The month's name ("September 2026"): the card's heading. */
  readonly title: string;
  readonly summary: CashFlowSummary;
  readonly sources: readonly IncomeSource[];
  readonly composition: SpendingComposition;
  readonly range: DateRange;
}) {
  const largest = composition.spent[0];
  const categories = composition.spent.length;
  return (
    // The same card as Trends' totals: a heading, then three panels in one equation.
    <section aria-labelledby="cash-flow-summary" className={cn(CARD, "p-5 md:p-7")}>
      <h2 id="cash-flow-summary" className="text-heading font-bold text-navy">
        {title}
      </h2>
      <p className="mt-1 text-meta text-ink-2">What came in and went out, added up.</p>
      <div className="mt-5 grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1.15fr)] lg:gap-2.5">
        <Side
          term="Came in"
          amount={<Money amount={summary.income} sign="none" />}
          link={
            summary.income !== 0
              ? {
                  href: activityHref({ type: "income", range }),
                  text: "Income transactions",
                  label: `Income, ${rangeLabel(range)}`,
                }
              : null
          }
        >
          {sources.length > 0 && (
            <ul className="divide-y divide-line-soft">
              {sources.map((s) => (
                <Line key={s.categoryId} name={s.name}>
                  <Money amount={s.amount} sign="none" />
                </Line>
              ))}
            </ul>
          )}
        </Side>

        <Operator>−</Operator>

        {/* No type filter: Activity's Spent total is expenses net of refunds, exactly this figure. */}
        <Side
          term="Went out"
          amount={<Money amount={summary.spending} />}
          link={
            summary.spending !== 0
              ? {
                  href: activityHref({ range }),
                  text: "Spending transactions",
                  label: `Spending, ${rangeLabel(range)}`,
                }
              : null
          }
        >
          {categories > 0 && (
            <ul className="divide-y divide-line-soft">
              {largest && largest.amount > 0 && (
                <Line name={`Largest: ${largest.name}`}>
                  <Money amount={largest.amount} sign="none" />
                </Line>
              )}
              <Line name="Categories">{categories}</Line>
            </ul>
          )}
        </Side>

        <Operator>=</Operator>

        <LeftOver summary={summary} />
      </div>
    </section>
  );
}

/**
 * One side of the equation. The term and its amount are a term and definition
 * (the page's figures are read that way); the rows under it are evidence.
 */
function Side({
  term,
  amount,
  link,
  children,
}: {
  readonly term: string;
  readonly amount: ReactNode;
  readonly link: {
    readonly href: string;
    readonly text: string;
    /** What a screen reader hears before the figure ("Spending, 1–30 Sep 2026"). */
    readonly label: string;
  } | null;
  readonly children: ReactNode;
}) {
  return (
    <dl className="flex min-w-0 flex-col rounded-[12px] bg-surface-subtle px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--color-line-soft)]">
      <div>
        <dt className="text-micro font-semibold tracking-[0.08em] text-ink-2 uppercase">{term}</dt>
        <dd className="mt-1 text-figure font-bold whitespace-nowrap text-navy tabular-nums md:text-[2rem] md:leading-tight">
          {link ? (
            // The figure opens its transactions; it names its period for a screen reader.
            <Link href={link.href} className={cn("outline-none", linkClass)}>
              <span className="sr-only">{link.label}: </span>
              {amount}
            </Link>
          ) : (
            amount
          )}
        </dd>
      </div>
      <div className="mt-3 flex-1 text-meta">{children}</div>
      {link && (
        <Link
          href={link.href}
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 self-start text-meta font-medium text-ocean",
            linkClass,
          )}
        >
          {link.text}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      )}
    </dl>
  );
}

function Line({ name, children }: { readonly name: string; readonly children: ReactNode }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0 truncate text-ink-2">{name}</span>
      <span className="shrink-0 font-semibold text-ink tabular-nums">{children}</span>
    </li>
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

/** The outcome, on the area's flat mist: what was left over, and the savings rate. */
function LeftOver({ summary }: { readonly summary: CashFlowSummary }) {
  const { income, leftOver, savingsRate } = summary;
  const hundred = perHundred(savingsRate);
  return (
    <dl className="flex min-w-0 flex-col rounded-[12px] bg-mist/35 px-4 py-3.5 shadow-[inset_0_0_0_1px_rgb(70_103_141/0.14)]">
      <div>
        <dt className="text-micro font-semibold tracking-[0.08em] text-ocean uppercase">
          Left over
        </dt>
        {/* A true minus when more went out; never berry: it is direction, not an error. */}
        <dd className="mt-1 text-figure font-bold whitespace-nowrap text-navy tabular-nums md:text-[2rem] md:leading-tight">
          <Money amount={leftOver} />
        </dd>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3 text-meta">
        <dt className="text-ink-2">Savings rate</dt>
        <dd className="font-bold text-navy tabular-nums">
          {savingsRate ? formatPercent(savingsRate) : "—"}
        </dd>
      </div>
      <span aria-hidden className="mt-1.5 block h-1.5 rounded-full bg-surface">
        <span
          className="block h-full rounded-full bg-navy"
          style={{ width: `${rateWidth(savingsRate) * 100}%` }}
        />
      </span>
      <p className="mt-2.5 text-meta text-ink-2">
        {income === 0 ? (
          "Nothing came in this month, so there's no savings rate."
        ) : leftOver < 0 ? (
          "More went out than came in."
        ) : (
          <>
            You kept about <Money amount={hundred} sign="none" className="font-semibold text-ink" />{" "}
            of every <Money amount={10_000 as typeof hundred} sign="none" /> that came in.
          </>
        )}
      </p>
    </dl>
  );
}
