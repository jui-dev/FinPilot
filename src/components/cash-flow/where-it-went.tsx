import Link from "next/link";

import type { DateRange } from "@/domain/calendar-date";
import { formatShare, type Ratio } from "@/domain/ledger/analytics";
import type { CompositionLine, SpendingComposition } from "@/domain/ledger/cash-flow";
import { negate } from "@/domain/money";

import { activityHref } from "../activity/links";
import { categoryIcon, Glyph } from "../ledger/icons";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { EmptyState } from "../ui/panel";
import { CARD } from "./labels";

/**
 * The strip's tones, largest first: they only separate neighbouring segments
 * (the rows below are in the same order). The rows' bars are all one blue:
 * colour never names or ranks a category (docs/design-direction.md §5).
 */
const STRIP = ["bg-navy", "bg-ocean", "bg-tide", "bg-tide/55"] as const;
const stripTone = (index: number) => STRIP[Math.min(index, STRIP.length - 1)]!;

/** A domain share as a fraction of 1: presentation only, the percentage stays the truth. */
const fraction = (share: Ratio) => share.numerator / share.denominator;

/**
 * The rows are a ranked bar chart: the largest category spans the bar column
 * and the others are drawn against it. There is no track, because the bars
 * are not out of 100%; the strip above shows the whole. Presentation only.
 */
const relativeTo = (share: Ratio, largest: number) => (largest > 0 ? fraction(share) / largest : 0);

/**
 * Where the month's spending went: the whole as one strip, then each category
 * as an aligned bar drawn to its share of the spending. Each row opens that
 * category's transactions for the period.
 */
export function WhereItWent({
  composition,
  range,
  monthName,
  runningMonth,
  className,
}: {
  readonly composition: SpendingComposition;
  readonly range: DateRange;
  readonly monthName: string;
  readonly runningMonth: boolean;
  readonly className?: string;
}) {
  const { spent, refundedMoreThanSpent } = composition;
  const quiet = spent.length === 0 && refundedMoreThanSpent.length === 0;
  const largest = Math.max(0, ...spent.map((line) => (line.share ? fraction(line.share) : 0)));
  return (
    <section aria-labelledby="cash-flow-composition" className={cn(CARD, "pb-2", className)}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 pt-5">
        <h2 id="cash-flow-composition" className="text-heading font-bold text-navy">
          Where it went
        </h2>
        <p className="text-body text-ink-2">By category, largest first</p>
      </header>

      {quiet ? (
        <EmptyState title={`Nothing was spent in ${monthName}`}>
          {runningMonth
            ? "Spending you record this month will appear here."
            : "No expenses were recorded in this month."}
        </EmptyState>
      ) : (
        <>
          {spent.some((line) => line.share) && (
            <div aria-hidden className="mx-5 mt-5 flex h-3 gap-0.5 overflow-hidden rounded-full">
              {spent.map((line, index) =>
                line.share && fraction(line.share) > 0 ? (
                  <span
                    key={line.categoryId}
                    className={cn("min-w-0.5 rounded-full", stripTone(index))}
                    style={{ flexGrow: fraction(line.share) }}
                  />
                ) : null,
              )}
            </div>
          )}
          {spent.length > 0 && (
            <ul aria-label="Spending by category" className="mt-2 px-2">
              {spent.map((line) => (
                <CategoryRow
                  key={line.categoryId}
                  line={line}
                  range={range}
                  spent
                  largest={largest}
                />
              ))}
            </ul>
          )}
          {refundedMoreThanSpent.length > 0 && (
            <>
              <h3 className="mx-5 mt-3 border-t border-line pt-3 text-meta font-semibold text-ink-2">
                Refunded more than spent
              </h3>
              <ul aria-label="Refunded more than spent" className="px-2">
                {refundedMoreThanSpent.map((line) => (
                  <CategoryRow
                    key={line.categoryId}
                    line={line}
                    range={range}
                    spent={false}
                    largest={largest}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Phones: icon, name and amount, then the bar with the share beside it.
 * md and up: one line (icon, name, bar, share, amount), so every bar starts
 * at the same x and the bars read as one chart.
 */
function CategoryRow({
  line,
  range,
  spent,
  largest,
}: {
  readonly line: CompositionLine;
  readonly range: DateRange;
  /** False for a line refunded more than spent: it has no share, so no bar. */
  readonly spent: boolean;
  readonly largest: number;
}) {
  const refunded = line.amount < 0;
  return (
    <li className="group relative grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-control px-3 py-2.5 transition-colors hover:bg-canvas has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-ocean md:grid-cols-[2.25rem_9.5rem_minmax(0,1fr)_3rem_6.5rem]">
      <Glyph
        icon={categoryIcon(line.name)}
        tone="info"
        className={cn(line.share && spent && "row-span-2 md:row-span-1")}
      />
      <Link
        href={activityHref({ categoryId: line.categoryId, range })}
        className="truncate font-semibold text-ink outline-none after:absolute after:inset-0 after:rounded-control"
      >
        {line.name}
      </Link>
      <span className="text-right text-body font-bold whitespace-nowrap text-navy md:col-start-5 md:row-start-1">
        {refunded ? (
          <>
            <Money amount={negate(line.amount)} sign="none" />
            <span className="ml-1 text-meta font-normal text-ink-2">back</span>
          </>
        ) : (
          <Money amount={line.amount} sign="none" />
        )}
      </span>
      {line.share && spent && (
        <>
          <span aria-hidden className="col-start-2 h-2 md:col-start-3 md:row-start-1">
            <span
              className="block h-full rounded-full bg-ocean"
              // A share that "<1%" describes stays visible; a true zero draws nothing.
              style={{
                width:
                  fraction(line.share) > 0
                    ? `max(3px, ${relativeTo(line.share, largest) * 100}%)`
                    : "0",
              }}
            />
          </span>
          <span className="text-right text-body text-ink-2 tabular-nums md:col-start-4 md:row-start-1">
            {formatShare(line.share)}
          </span>
        </>
      )}
    </li>
  );
}
