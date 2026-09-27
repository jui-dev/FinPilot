import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronDown, Minus } from "lucide-react";
import Link from "next/link";

import type { DateRange } from "@/domain/calendar-date";
import { formatShare } from "@/domain/ledger/analytics";
import type { CashFlowPeriod } from "@/domain/ledger/cash-flow";
import type { CategoryChange, SpendingChange } from "@/domain/ledger/month-over-month";
import { abs, type Money as MoneyValue } from "@/domain/money";
import type { MonthOverMonth } from "@/server/services/analysis-service";

import { activityHref } from "../activity/links";
import { rangeLabel } from "../format";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { EmptyState } from "../ui/panel";
import { CARD, comparedPeriodName, comparisonNote } from "./labels";

interface ChangeRanges {
  readonly previous: DateRange;
  readonly current: DateRange;
}

/**
 * Why spending moved against the comparison period (Stage 5b): the direction
 * first, the two totals side by side, then the categories that drove it.
 * Every figure and every materiality decision comes from the domain; this only
 * lays them out. Direction is always carried by the sign, the word and the
 * arrow; colour repeats it (coral higher, blue lower) and never stands alone.
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
  return (
    <section aria-labelledby="cash-flow-change" className={cn(CARD, className)}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 pt-5">
        <h2 id="cash-flow-change" className="text-heading font-bold text-navy">
          What changed
        </h2>
        {change && <p className="text-body text-ink-2">{comparisonNote(change.comparison)}</p>}
      </header>
      {!change ? (
        <EmptyState title="No earlier month to compare with" />
      ) : quiet ? (
        <EmptyState title="Nothing was spent in either period" />
      ) : (
        <Explanation
          explanation={change.explanation}
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

function Explanation({
  explanation,
  names,
  ranges,
}: {
  readonly explanation: SpendingChange;
  readonly names: { readonly previous: string; readonly current: string };
  readonly ranges: ChangeRanges;
}) {
  const { net, previousTotal, currentTotal, smallerChanges } = explanation;
  const higher = explanation.increases.filter((l) => l.material);
  const lower = explanation.offsets.filter((l) => l.material);
  // The bars compare the drivers with each other: the largest material change
  // spans the track. Presentation only; the amounts beside them are the truth.
  const largest = Math.max(0, ...[...higher, ...lower].map((l) => Math.abs(l.change)));
  const direction = net > 0 ? "higher" : net < 0 ? "lower" : "same";
  const Icon = net > 0 ? ArrowUpRight : net < 0 ? ArrowDownRight : Minus;
  return (
    <>
      <div className="flex items-center gap-3 px-5 pt-4">
        <span
          aria-hidden
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full",
            direction === "higher" && "bg-coral-soft text-navy",
            direction === "lower" && "bg-mist text-ocean",
            direction === "same" && "bg-surface-hover text-ink-2",
          )}
        >
          <Icon className="size-5" strokeWidth={2.25} />
        </span>
        <p className="text-figure font-bold text-navy">
          {net === 0 ? (
            "Spending unchanged"
          ) : (
            <>
              Spending <Money amount={abs(net)} sign="none" /> {net > 0 ? "higher" : "lower"}
            </>
          )}
        </p>
      </div>

      <dl className="mx-5 mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-control bg-canvas px-3.5 py-3">
          <dt className="truncate text-body text-ink-2">{names.previous}</dt>
          <dd className="mt-0.5 text-body font-bold text-ink-2">
            <Money amount={previousTotal} />
          </dd>
        </div>
        <div className="rounded-control bg-mist px-3.5 py-3">
          <dt className="truncate text-body text-ocean">{names.current}</dt>
          <dd className="mt-0.5 text-body font-bold text-navy">
            <Money amount={currentTotal} />
          </dd>
        </div>
      </dl>

      {higher.length > 0 && (
        <DriverGroup
          title="Higher"
          label="Categories that were higher"
          lines={higher}
          largest={largest}
          ranges={ranges}
          tone="higher"
        />
      )}
      {lower.length > 0 && (
        <DriverGroup
          title="Lower"
          label="Categories that were lower"
          lines={lower}
          largest={largest}
          ranges={ranges}
          tone="lower"
        />
      )}

      {smallerChanges.count > 0 && (
        // Closed by default so the explanation stays on its drivers; opening it
        // shows every change below the materiality threshold, with its evidence.
        <details className="group mx-5 mt-4 rounded-control bg-canvas">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-control px-4 py-3 transition-colors hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
            <ChevronDown
              aria-hidden
              className="size-4 shrink-0 text-ink-2 transition-transform group-open:rotate-180"
            />
            <span className="min-w-0 flex-1 text-body text-ink-2">
              {smallerChanges.count === 1
                ? "1 smaller change"
                : `${smallerChanges.count} smaller changes`}
            </span>
            <span className="text-body font-bold text-navy">
              <Money amount={smallerChanges.net} sign="always" />
            </span>
          </summary>
          <ul aria-label="Smaller changes" className="border-t border-line pb-1">
            {[...explanation.increases, ...explanation.offsets]
              .filter((l) => !l.material)
              .map((line) => (
                <DriverRow key={line.categoryId} line={line} ranges={ranges} bar={null} inset />
              ))}
          </ul>
        </details>
      )}
      <div className="h-5" />
    </>
  );
}

function DriverGroup({
  title,
  label,
  lines,
  largest,
  ranges,
  tone,
}: {
  readonly title: string;
  readonly label: string;
  readonly lines: readonly CategoryChange[];
  readonly largest: number;
  readonly ranges: ChangeRanges;
  readonly tone: "higher" | "lower";
}) {
  return (
    <div className="mt-5 border-t border-line">
      <h3 className="flex items-center gap-2 px-5 pt-4 text-meta font-semibold text-ink-2">
        <span
          aria-hidden
          className={cn("size-2 rounded-full", tone === "higher" ? "bg-coral" : "bg-ocean")}
        />
        {title}
      </h3>
      <ul aria-label={label}>
        {lines.map((line) => (
          <DriverRow
            key={line.categoryId}
            line={line}
            ranges={ranges}
            bar={{ fraction: largest > 0 ? Math.abs(line.change) / largest : 0, tone }}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * One category's change, in order of importance: the name and the signed
 * change, a bar for its size among the drivers, both sides as evidence
 * ("৳5,300 → ৳5,950", each opening that category's transactions in its own
 * period), and last its share of the increase.
 */
function DriverRow({
  line,
  ranges,
  bar,
  inset = false,
}: {
  readonly line: CategoryChange;
  readonly ranges: ChangeRanges;
  readonly bar: { readonly fraction: number; readonly tone: "higher" | "lower" } | null;
  /** Inside the smaller-changes well: tighter, no bar. */
  readonly inset?: boolean;
}) {
  const evidence = (amount: MoneyValue, range: DateRange) => (
    <Link
      href={activityHref({ categoryId: line.categoryId, range })}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-body text-ink tabular-nums transition-colors hover:bg-mist hover:text-ocean",
        // Inside the smaller-changes well (canvas), the pill stays visible on white.
        inset ? "bg-surface" : "bg-canvas",
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
        "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3",
        inset ? "px-4 py-2.5" : "px-5 py-3",
      )}
    >
      <span className="truncate font-semibold text-ink">{line.name}</span>
      <span className="w-28 justify-self-end text-right text-heading font-bold whitespace-nowrap text-navy">
        <Money amount={line.change} sign="always" />
      </span>
      {bar && (
        <span aria-hidden className="col-span-2 mt-2 h-2">
          <span
            className={cn(
              "block h-full rounded-full",
              bar.tone === "higher" ? "bg-coral" : "bg-ocean",
            )}
            style={{ width: bar.fraction > 0 ? `max(3px, ${bar.fraction * 100}%)` : "0" }}
          />
        </span>
      )}
      <span className="col-span-2 mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-1">
          {evidence(line.previous, ranges.previous)}
          <ArrowRight aria-hidden className="size-3.5 text-ink-3" />
          {evidence(line.current, ranges.current)}
        </span>
        {line.shareOfIncreases && (
          <span className="text-body text-ink-2 tabular-nums">
            {formatShare(line.shareOfIncreases)} of the increase
          </span>
        )}
      </span>
    </li>
  );
}
