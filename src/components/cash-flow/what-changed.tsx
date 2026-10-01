import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronDown, Minus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { DateRange, YearMonth } from "@/domain/calendar-date";
import { formatShare } from "@/domain/ledger/analytics";
import type { CashFlowPeriod } from "@/domain/ledger/cash-flow";
import type { CategoryChange, SpendingChange } from "@/domain/ledger/month-over-month";
import { abs, type Money as MoneyValue } from "@/domain/money";
import type { MonthOverMonth } from "@/server/services/analysis-service";

import { activityHref } from "../activity/links";
import { monthLabel, rangeLabel } from "../format";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { EmptyState } from "../ui/panel";
import { CARD, comparedPeriodName, comparisonNote } from "./labels";

export interface ChangeRanges {
  readonly previous: DateRange;
  readonly current: DateRange;
}

/** "Aug": a column heading for a compared month. */
const monthShort = (month: YearMonth | string) => monthLabel(month).slice(0, 3);

/**
 * The table's columns from md: category, the two periods, the change, and
 * the bar. Phones stack each row instead (name and change, bar, both periods).
 */
const COLUMNS =
  "md:grid-cols-[minmax(0,1.1fr)_6.5rem_6.5rem_7rem_minmax(0,1.4fr)] md:items-center md:gap-x-4";

/**
 * Why spending moved against the comparison period (Stage 5b): the direction
 * first, then every category that drove it as a table — both periods (each
 * opening its own transactions), the change, and a bar either side of a
 * centre line (lower to the left, higher to the right). Every figure and
 * every materiality decision is the domain's. Direction is always carried by
 * the sign and the side; colour only repeats it (navy higher, tide lower) and
 * is never a warning: a change in spending is not a fault.
 */
export function WhatChanged({
  change,
  period,
  className,
}: {
  readonly change: MonthOverMonth | null;
  readonly period: CashFlowPeriod;
  readonly className?: string;
}) {
  const explanation = change?.explanation;
  const quiet =
    explanation !== undefined &&
    explanation.increases.length === 0 &&
    explanation.offsets.length === 0 &&
    explanation.unchanged.length === 0;
  const net = explanation?.net ?? (0 as MoneyValue);
  return (
    <section aria-labelledby="cash-flow-change" className={cn(CARD, "overflow-clip", className)}>
      <ChangeBand
        id="cash-flow-change"
        net={net}
        headline={change !== null && !quiet}
        note={change && comparisonNote(change.comparison)}
        aside={
          change &&
          !quiet && (
            <div className="flex items-center gap-2">
              <PeriodTile
                name={monthShort(change.comparison.month)}
                amount={change.explanation.previousTotal}
              />
              <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-3" />
              <PeriodTile
                name={monthShort(period.month)}
                amount={change.explanation.currentTotal}
                current
              />
            </div>
          )
        }
      />
      {!change ? (
        <EmptyState title="No earlier month to compare with" />
      ) : quiet ? (
        <EmptyState title="Nothing was spent in either period" />
      ) : (
        <Explanation
          explanation={change.explanation}
          labels={{
            previous: monthShort(change.comparison.month),
            current: monthShort(period.month),
          }}
          names={{
            previous: comparedPeriodName(
              change.comparison.kind,
              change.comparison.month,
              change.comparison.range,
            ),
            current: comparedPeriodName(period.kind, period.month, period.range),
          }}
          ranges={{ previous: change.comparison.range, current: period.range }}
        />
      )}
    </section>
  );
}

/**
 * What changed's headline band, shared by Cash flow and Trends: the section's
 * name, then the answer ("Spending ৳18,760 higher") with its direction mark,
 * a note naming what it is compared with, and on the right anything the page
 * adds (Cash flow's two period totals) above the Lower · Higher key.
 */
export function ChangeBand({
  id,
  net,
  headline,
  note,
  aside,
}: {
  readonly id: string;
  readonly net: MoneyValue;
  /** False when there is nothing to compare: the band keeps only its name and note. */
  readonly headline: boolean;
  readonly note: ReactNode;
  readonly aside?: ReactNode;
}) {
  return (
    <header className="relative isolate flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-line-soft px-5 py-5 md:px-7 md:py-6">
      {/* The answer first, on the area's top-left light. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_120%_at_0%_0%,var(--color-mist)_0%,transparent_65%)] opacity-70"
      />
      <div className="min-w-0">
        <h2 id={id} className="text-micro font-semibold tracking-[0.08em] text-ocean uppercase">
          What changed
        </h2>
        {headline && (
          <div className="mt-2 flex items-center gap-3">
            <span
              aria-hidden
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-full",
                net > 0
                  ? "bg-navy text-white"
                  : net < 0
                    ? "bg-tide text-navy"
                    : "bg-surface-hover text-ink-2",
              )}
            >
              <Direction net={net} />
            </span>
            <p className="text-display font-bold text-navy">
              {net === 0 ? (
                "Spending unchanged"
              ) : (
                <>
                  Spending <Money amount={abs(net)} sign="none" /> {net > 0 ? "higher" : "lower"}
                </>
              )}
            </p>
          </div>
        )}
        {note && <p className="mt-2 text-body text-ink-2">{note}</p>}
      </div>
      {headline && (
        <div className="flex flex-col items-end gap-3">
          {aside}
          <ul aria-hidden className="flex gap-4 text-micro font-semibold text-ink-2 uppercase">
            <li className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-tide" /> Lower
            </li>
            <li className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-navy" /> Higher
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}

/** The headline's direction mark: up for higher, down for lower, a dash for unchanged. */
function Direction({ net }: { readonly net: number }) {
  if (net > 0) return <ArrowUpRight className="size-5" strokeWidth={2.25} />;
  if (net < 0) return <ArrowDownRight className="size-5" strokeWidth={2.25} />;
  return <Minus className="size-5" strokeWidth={2.25} />;
}

/** One compared period's total, as a small card: the current one on mist. */
function PeriodTile({
  name,
  amount,
  current = false,
}: {
  readonly name: string;
  readonly amount: MoneyValue;
  readonly current?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-24 rounded-[10px] px-3 py-2",
        current
          ? "bg-mist/70 shadow-[inset_0_0_0_1px_rgb(70_103_141/0.2)]"
          : "bg-surface/85 shadow-[inset_0_0_0_1px_var(--color-line-soft)]",
      )}
    >
      <p
        className={cn("text-micro font-semibold uppercase", current ? "text-ocean" : "text-ink-2")}
      >
        {name}
      </p>
      <Money
        amount={amount}
        className={cn(
          "text-body font-bold whitespace-nowrap tabular-nums",
          current ? "text-navy" : "text-ink-2",
        )}
      />
    </div>
  );
}

/**
 * The categories behind a change, as a table: both periods, the change, and a
 * bar either side of a centre line. Shared by Cash flow and Trends; Trends
 * leaves out each increase's share (it carries no percentages).
 */
export function Explanation({
  explanation,
  labels,
  names,
  ranges,
  shares = true,
}: {
  readonly explanation: SpendingChange;
  /** The two column headings ("Aug", "Sep"; or "Mar–May", "Jun–Aug"). */
  readonly labels: { readonly previous: string; readonly current: string };
  /** The periods in full, as the headings' titles. */
  readonly names: { readonly previous: string; readonly current: string };
  readonly ranges: ChangeRanges;
  /** Whether an increase says its share of all the increases. */
  readonly shares?: boolean;
}) {
  const { net, previousTotal, currentTotal, smallerChanges } = explanation;
  const higher = explanation.increases.filter((l) => l.material);
  const lower = explanation.offsets.filter((l) => l.material);
  // The bars compare the drivers with each other: the largest material change
  // reaches the edge of its half. Presentation only; the amounts are the truth.
  const largest = Math.max(0, ...[...higher, ...lower].map((l) => Math.abs(l.change)));
  const bar = (l: CategoryChange) => (largest > 0 ? Math.abs(l.change) / largest : 0);
  return (
    <div className="mt-3 px-2 pb-4 md:px-4 md:pb-5">
      <div
        aria-hidden
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_auto] border-b border-line-soft px-3 pb-2 text-micro font-semibold tracking-[0.08em] text-ink-2 uppercase",
          COLUMNS,
        )}
      >
        <span>Category</span>
        <span className="text-right max-md:hidden" title={names.previous}>
          {labels.previous}
        </span>
        <span className="text-right max-md:hidden" title={names.current}>
          {labels.current}
        </span>
        <span className="text-right">Change</span>
        <span className="max-md:hidden" />
      </div>

      {higher.length > 0 && (
        <ul aria-label="Categories that were higher">
          {higher.map((line) => (
            <DriverRow
              key={line.categoryId}
              line={line}
              ranges={ranges}
              bar={bar(line)}
              shares={shares}
            />
          ))}
        </ul>
      )}
      {lower.length > 0 && (
        <ul aria-label="Categories that were lower">
          {lower.map((line) => (
            <DriverRow
              key={line.categoryId}
              line={line}
              ranges={ranges}
              bar={bar(line)}
              shares={shares}
            />
          ))}
        </ul>
      )}

      {smallerChanges.count > 0 && (
        // Closed by default so the table stays on its drivers; opening it shows
        // every change below the materiality threshold, with its evidence.
        <details className="group border-b border-line-soft">
          <summary
            className={cn(
              "grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-control px-3 py-3 transition-colors hover:bg-canvas [&::-webkit-details-marker]:hidden",
              COLUMNS,
            )}
          >
            <span className="flex items-center gap-2 text-body text-ink-2">
              <ChevronDown
                aria-hidden
                className="size-4 shrink-0 transition-transform group-open:rotate-180"
              />
              {smallerChanges.count === 1
                ? "1 smaller change"
                : `${smallerChanges.count} smaller changes`}
            </span>
            <span className="max-md:hidden" />
            <span className="max-md:hidden" />
            <span className="text-right font-bold text-navy tabular-nums">
              <Money amount={smallerChanges.net} sign="always" />
            </span>
            <span className="max-md:hidden" />
          </summary>
          <ul aria-label="Smaller changes" className="bg-canvas/60">
            {[...explanation.increases, ...explanation.offsets]
              .filter((l) => !l.material)
              .map((line) => (
                <DriverRow
                  key={line.categoryId}
                  line={line}
                  ranges={ranges}
                  bar={null}
                  shares={shares}
                />
              ))}
          </ul>
        </details>
      )}

      <p
        className={cn(
          "mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-t-2 border-navy px-3 pt-3",
          COLUMNS,
        )}
      >
        <span className="font-bold text-navy">All spending</span>
        <Money
          amount={previousTotal}
          className="text-right text-body font-semibold text-ink-2 tabular-nums max-md:hidden"
        />
        <Money
          amount={currentTotal}
          className="text-right text-body font-semibold text-ink tabular-nums max-md:hidden"
        />
        <Money
          amount={net}
          sign="always"
          className="text-right text-body font-extrabold whitespace-nowrap text-navy tabular-nums"
        />
        <span className="max-md:hidden" />
      </p>
    </div>
  );
}

/**
 * One category's change: its name (and share of the increase), both periods
 * as evidence links, the signed change, and a bar from the centre line —
 * right for higher, left for lower. Rows below the materiality threshold
 * have no bar.
 */
function DriverRow({
  line,
  ranges,
  bar,
  shares,
}: {
  readonly line: CategoryChange;
  readonly ranges: ChangeRanges;
  /** The change's size among the drivers (0–1), or null for a smaller change. */
  readonly bar: number | null;
  readonly shares: boolean;
}) {
  const higher = line.change > 0;
  const evidence = (amount: MoneyValue, range: DateRange, current: boolean) => (
    <Link
      href={activityHref({ categoryId: line.categoryId, range })}
      className={cn(
        "justify-self-end rounded-full px-2 py-0.5 text-body tabular-nums underline decoration-ocean/40 underline-offset-4 transition-colors hover:bg-mist hover:text-ocean hover:decoration-ocean",
        current ? "text-ink" : "text-ink-2",
      )}
    >
      <span className="sr-only">
        {line.name}, {rangeLabel(range)}:{" "}
      </span>
      <Money amount={amount} />
    </Link>
  );
  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-2 border-b border-line-soft px-3 py-3 last:border-b-0",
        COLUMNS,
      )}
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold text-ink">{line.name}</span>
        {shares && line.shareOfIncreases && (
          <span className="block text-meta text-ink-2 tabular-nums">
            {formatShare(line.shareOfIncreases)} of the increase
          </span>
        )}
      </span>
      {/* Phones: the two periods share a row under the bar. */}
      <span className="col-span-2 row-start-3 flex items-center gap-1 md:contents">
        {evidence(line.previous, ranges.previous, false)}
        <ArrowRight aria-hidden className="size-3.5 text-ink-3 md:hidden" />
        {evidence(line.current, ranges.current, true)}
      </span>
      <span
        data-cell="change"
        className="col-start-2 row-start-1 text-right text-body font-bold whitespace-nowrap text-navy tabular-nums md:col-start-4"
      >
        <Money amount={line.change} sign="always" />
      </span>
      <span
        aria-hidden
        className="relative col-span-2 row-start-2 h-2.5 md:col-span-1 md:col-start-5 md:row-start-1"
      >
        {/* The centre line: no change. */}
        <span className="absolute -inset-y-0.75 left-1/2 w-px bg-line" />
        {bar !== null && bar > 0 && (
          <span
            className={cn(
              "absolute inset-y-0 rounded-full",
              higher ? "left-1/2 rounded-l-none bg-navy" : "right-1/2 rounded-r-none bg-tide",
            )}
            style={{ width: `max(3px, ${bar * 50}%)` }}
          />
        )}
      </span>
    </li>
  );
}
