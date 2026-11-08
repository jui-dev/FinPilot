import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import type { YearMonth } from "@/domain/calendar-date";
import type { Money as MoneyValue } from "@/domain/money";
import type { TrendMonth } from "@/server/services/analysis-service";

import { cashFlowHref } from "../activity/links";
import { CARD } from "../cash-flow/labels";
import { monthLabel } from "../format";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { shortMonth } from "./describe";
import { axisAmount, niceDomain } from "./scale";

/**
 * "How did each month go?" (Trends). From md: one table that is also the
 * chart. Its first row draws each month's two bars — what came in (tide) and
 * what went out (navy, with any part beyond what came in hatched warm) — on one scale,
 * and the rows under it give the exact figures in the same columns, so each
 * number sits under its own bars. Each month opens its Cash flow page. On
 * phones the same months as calm rows, newest first.
 */
export function MonthByMonth({
  months,
  currentMonth,
  className,
}: {
  readonly months: readonly TrendMonth[];
  readonly currentMonth: YearMonth;
  readonly className?: string;
}) {
  const domain = niceDomain(months.flatMap((m) => [m.income, m.spending]));
  const span = domain.hi - domain.lo;
  /** Where an amount sits on the drawing, as a percentage from its floor. */
  const at = (v: number) => ((v - domain.lo) / span) * 100;
  const ticks = Array.from(
    { length: Math.round(span / domain.step) + 1 },
    (_, i) => domain.lo + i * domain.step,
  );
  return (
    <section aria-labelledby="trends-months" className={cn(CARD, "overflow-clip", className)}>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 pt-5 md:px-7 md:pt-6">
        <div className="min-w-0">
          <h2 id="trends-months" className="text-heading font-bold text-navy">
            Month by month
          </h2>
          <p className="mt-1 text-meta text-ink-2">
            What came in and went out each month. Each month opens on Cash flow.
          </p>
        </div>
        <ul
          aria-hidden
          className="flex flex-wrap gap-x-5 gap-y-1 text-meta text-ink-2 max-md:hidden"
        >
          <Key className="bg-tide">Came in</Key>
          <Key className="bg-navy">Went out</Key>
          {months.some((m) => m.leftOver < 0) && (
            <Key className={OVER}>Went out more than came in</Key>
          )}
        </ul>
      </header>

      <div className="scrollbar-subtle mt-3 overflow-x-auto px-5 pt-3 pb-5 max-md:hidden md:px-7 md:pb-6">
        <table
          className="w-full table-fixed border-collapse"
          style={{ minWidth: `${6 + months.length * 5.25}rem` }}
        >
          <caption className="sr-only">Came in, went out and left over each month</caption>
          <colgroup>
            <col className="w-24" />
            {months.map((m) => (
              <col key={m.month} />
            ))}
          </colgroup>
          <thead>
            {/* The drawing: hidden from assistive technology, the rows below carry every figure. */}
            <tr aria-hidden>
              <td className="relative h-56 p-0">
                {ticks.map((v) => (
                  <span
                    key={v}
                    className="absolute right-3 translate-y-1/2 text-micro whitespace-nowrap text-ink-3 tabular-nums"
                    style={{ bottom: `${at(v)}%` }}
                  >
                    {axisAmount(v)}
                  </span>
                ))}
              </td>
              {months.map((m) => (
                <td key={m.month} className="relative h-56 p-0">
                  {ticks.map((v) => (
                    <span
                      key={v}
                      className={cn(
                        "absolute inset-x-0 border-t",
                        v === 0 ? "border-line-strong" : "border-dashed border-line",
                      )}
                      style={{ bottom: `${at(v)}%` }}
                    />
                  ))}
                  <Link
                    href={cashFlowHref(m.month, currentMonth)}
                    // A larger target for the pointer only: the month's name below is the named link.
                    tabIndex={-1}
                    aria-hidden
                    className="absolute inset-x-1 top-0 flex items-end justify-center gap-1.5 rounded-t-[10px] transition-colors hover:bg-mist/40"
                    style={{ bottom: `${at(0)}%` }}
                  >
                    <Bar amount={m.income} top={domain.hi} className="bg-tide" />
                    <SpendBar spending={m.spending} income={m.income} top={domain.hi} />
                  </Link>
                </td>
              ))}
            </tr>
            <tr>
              <td />
              {months.map((m) => (
                <th key={m.month} scope="col" className="px-1 pt-2.5 pb-2 text-center">
                  <Link
                    href={cashFlowHref(m.month, currentMonth)}
                    aria-label={monthLabel(m.month)}
                    className="inline-block rounded-control px-1.5 leading-tight focus-visible:outline-2 focus-visible:outline-ocean"
                  >
                    <span className="block text-body font-bold text-ink">
                      {shortMonth(m.month)}
                    </span>
                    <span className="block text-micro font-medium text-ink-3">
                      {m.month.slice(0, 4)}
                    </span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <FigureRow term="Came in" months={months} value={(m) => m.income} />
            <FigureRow term="Went out" months={months} value={(m) => m.spending} />
            <FigureRow term="Left over" months={months} value={(m) => m.leftOver} strong />
          </tbody>
        </table>
      </div>

      <ul aria-label="Months" className="mt-3 md:hidden">
        {[...months].reverse().map((m) => (
          <li key={m.month} className="border-t border-line-soft">
            <Link
              href={cashFlowHref(m.month, currentMonth)}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-5 py-3 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ocean"
            >
              <span className="font-semibold text-ink">{monthLabel(m.month)}</span>
              <ChevronRight aria-hidden className="row-span-3 size-4 text-ink-3" />
              <span className="mt-1 flex items-baseline gap-2 text-meta text-ink-2">
                Left over
                {/* Navy with a true minus when more went out: a direction, not an error. */}
                <Money amount={m.leftOver} className="text-heading font-bold text-navy" />
              </span>
              <span className="mt-0.5 text-meta text-ink-2">
                In <Money amount={m.income} /> · Out <Money amount={m.spending} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The part of what went out beyond what came in: a warm hatch, the spending family. */
const OVER =
  "bg-[repeating-linear-gradient(135deg,color-mix(in_srgb,var(--color-coral)_55%,var(--color-surface))_0_3px,color-mix(in_srgb,var(--color-coral)_14%,var(--color-surface))_3px_6px)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-coral)_45%,transparent)]";

function Key({ className, children }: { readonly className: string; readonly children: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded-[3px]", className)} />
      {children}
    </li>
  );
}

/**
 * One bar from the zero line, as a share of the space above it (up to the
 * scale's top); a negative amount (refunds beyond spending) draws nothing.
 */
function Bar({
  amount,
  top,
  className,
}: {
  readonly amount: MoneyValue;
  readonly top: number;
  readonly className: string;
}) {
  const style: CSSProperties = { height: `${(Math.max(amount, 0) / top) * 100}%` };
  return <span className={cn("w-[min(1.625rem,34%)] rounded-t-md", className)} style={style} />;
}

/**
 * What went out: navy up to what came in, and any part beyond it hatched in
 * the warm spending family (the exceeded portion, not an error). Drawn from
 * the zero line on the same scale as the Came in bar.
 */
function SpendBar({
  spending,
  income,
  top,
}: {
  readonly spending: MoneyValue;
  readonly income: MoneyValue;
  readonly top: number;
}) {
  const out = Math.max(spending, 0);
  if (out === 0) return <span className="w-[min(1.625rem,34%)]" />;
  const within = Math.min(out, Math.max(income, 0));
  return (
    <span
      className="flex w-[min(1.625rem,34%)] flex-col-reverse overflow-hidden rounded-t-md"
      style={{ height: `${(out / top) * 100}%` }}
    >
      <span className="block bg-navy" style={{ height: `${(within / out) * 100}%` }} />
      {out > within && <span className={cn("block flex-1 rounded-t-md", OVER)} data-part="over" />}
    </span>
  );
}

function FigureRow({
  term,
  months,
  value,
  strong = false,
}: {
  readonly term: string;
  readonly months: readonly TrendMonth[];
  readonly value: (m: TrendMonth) => MoneyValue;
  /** Left over: the row the others add up to. */
  readonly strong?: boolean;
}) {
  return (
    <tr className="border-t border-line-soft">
      <th
        scope="row"
        className={cn(
          "py-2.5 pr-3 text-left text-meta",
          strong ? "font-bold text-navy" : "font-normal text-ink-2",
        )}
      >
        {term}
      </th>
      {months.map((m) => {
        const v = value(m);
        return (
          <td
            key={m.month}
            className={cn(
              "px-1 py-2.5 text-center text-meta whitespace-nowrap tabular-nums",
              // Left over keeps navy and a true minus below zero: a direction, not an error.
              strong ? "font-extrabold text-navy" : "font-semibold text-ink",
            )}
          >
            <Money amount={v} />
          </td>
        );
      })}
    </tr>
  );
}
