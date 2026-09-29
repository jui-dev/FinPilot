"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import type { YearMonth } from "@/domain/calendar-date";
import { formatMoney, type Money as MoneyValue } from "@/domain/money";

import { cashFlowHref } from "../activity/links";
import { CARD } from "../cash-flow/labels";
import { monthLabel } from "../format";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { monthsCount, monthSpan, shortMonth } from "./describe";
import { axisAmount, journeyGeometry, type JourneyGeometry } from "./journey-geometry";

export interface JourneyMonthView {
  readonly month: YearMonth;
  readonly income: MoneyValue;
  readonly spending: MoneyValue;
  readonly leftOver: MoneyValue;
}

/**
 * "What shape has my money taken over time?" (Trends). Came in and Went out
 * as one flat step per month, the gap between them left over, and a lane that
 * sets every month's Left over on one zero line. Above it, one month's
 * statement: the latest complete month until another is chosen — by pointer,
 * by keyboard (the months are a radio group) or by tap. The drawing is hidden
 * from assistive technology; the statement and the month-by-month record
 * carry every figure. Nothing is named as an event: the ledger doesn't know
 * what a month meant, only what moved.
 */
export function Journey({
  months,
  halves,
  currentMonth,
}: {
  readonly months: readonly JourneyMonthView[];
  readonly halves: {
    readonly earlier: readonly YearMonth[];
    readonly recent: readonly YearMonth[];
  } | null;
  readonly currentMonth: YearMonth;
}) {
  const [selected, setSelected] = useState(months.length - 1);
  const [width, setWidth] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const radios = useRef<(HTMLButtonElement | null)[]>([]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(Math.floor(el.getBoundingClientRect().width));
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const month = months[selected]!;
  const geometry = width ? journeyGeometry(months, width) : null;

  const move = (event: KeyboardEvent) => {
    const last = months.length - 1;
    const next =
      event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? Math.max(0, selected - 1)
        : event.key === "ArrowRight" || event.key === "ArrowDown"
          ? Math.min(last, selected + 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setSelected(next);
    radios.current[next]?.focus();
  };

  return (
    <section aria-labelledby="trends-journey" className={cn(CARD, "overflow-clip")}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 pt-5 md:px-6">
        <h2 id="trends-journey" className="text-heading font-bold text-navy">
          Came in and went out
        </h2>
        <p className="text-body text-ink-2">
          {monthSpan(months.map((m) => m.month))} · {monthsCount(months.length)}
        </p>
      </header>

      <Statement month={month} currentMonth={currentMonth} />

      <ul
        aria-hidden
        className="flex flex-wrap gap-x-5 gap-y-1.5 px-5 pt-4 text-meta text-ink-2 md:px-6"
      >
        <li className="flex items-center gap-2">
          <span className="h-[3px] w-4 rounded-full bg-navy" />
          Came in
        </li>
        <li className="flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full bg-ocean" />
          Went out
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-3.5 rounded-[3px] bg-mist shadow-[inset_0_0_0_1px_var(--color-tide)]" />
          Left over
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-3.5 rounded-[3px] bg-[repeating-linear-gradient(135deg,var(--color-surface)_0_3px,var(--color-ocean)_3px_4px)] shadow-[inset_0_0_0_1.5px_var(--color-ocean)]" />
          More went out than came in
        </li>
      </ul>

      <div ref={box} className="relative mx-3 mt-2 mb-4 min-h-[300px] md:mx-4 md:min-h-[400px]">
        {geometry && (
          <>
            <Drawing geometry={geometry} months={months} halves={halves} selected={selected} />
            <div
              role="radiogroup"
              aria-label="Month shown above the chart"
              onKeyDown={move}
              className="absolute inset-0"
            >
              {months.map((m, i) => {
                const slot = geometry.slots[i]!;
                return (
                  <button
                    key={m.month}
                    ref={(el) => {
                      radios.current[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={i === selected}
                    aria-label={monthLabel(m.month)}
                    tabIndex={i === selected ? 0 : -1}
                    onClick={() => setSelected(i)}
                    onFocus={() => setSelected(i)}
                    onPointerEnter={(e) => {
                      if (e.pointerType === "mouse") setSelected(i);
                    }}
                    className="absolute cursor-pointer rounded-control focus-visible:outline-2 focus-visible:outline-ocean"
                    style={{
                      left: slot.x,
                      width: slot.width,
                      top: geometry.plot.top - 12,
                      height: geometry.bracketY - geometry.plot.top + 4,
                    }}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * One month, read like Cash flow's summary: what was left over on mist, then
 * the two facts it comes from, and the way to that month's own page.
 */
function Statement({
  month,
  currentMonth,
}: {
  readonly month: JourneyMonthView;
  readonly currentMonth: YearMonth;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="mx-3 mt-4 grid grid-cols-2 overflow-clip rounded-panel border border-line md:mx-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]"
    >
      <div className="col-span-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 bg-mist px-4 py-4 md:col-span-1 md:px-5">
        <dl>
          <dt className="text-body font-semibold text-navy">
            Left over · {monthLabel(month.month)}
          </dt>
          <dd className="mt-1 text-display font-bold text-navy">
            <Money amount={month.leftOver} />
          </dd>
          <dd className="mt-1 text-body text-ink-2">
            {month.leftOver < 0 ? (
              "More went out than came in"
            ) : month.income > 0 ? (
              <>
                Of <Money amount={month.income} sign="none" className="font-semibold text-ink" />{" "}
                that came in
              </>
            ) : (
              "Nothing came in"
            )}
          </dd>
        </dl>
        <Link
          href={cashFlowHref(month.month, currentMonth)}
          className="inline-flex items-center gap-0.5 rounded-control text-body font-medium text-ocean hover:underline focus-visible:outline-2 focus-visible:outline-ocean"
        >
          Open on Cash flow
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      </div>
      <Fact term="Came in" amount={month.income} />
      <Fact term="Went out" amount={month.spending} className="border-l border-line" />
    </div>
  );
}

function Fact({
  term,
  amount,
  className,
}: {
  readonly term: string;
  readonly amount: MoneyValue;
  readonly className?: string;
}) {
  return (
    <dl className={cn("px-4 py-3.5 md:border-l md:border-line md:px-5 md:py-4", className)}>
      <dt className="text-body text-ink-2">{term}</dt>
      <dd className="mt-1 text-figure font-bold text-ink">
        <Money amount={amount} />
      </dd>
    </dl>
  );
}

function Drawing({
  geometry: g,
  months,
  halves,
  selected,
}: {
  readonly geometry: JourneyGeometry;
  readonly months: readonly JourneyMonthView[];
  readonly halves: {
    readonly earlier: readonly YearMonth[];
    readonly recent: readonly YearMonth[];
  } | null;
  readonly selected: number;
}) {
  const hatch = useId().replace(/:/g, "");
  const last = months[months.length - 1]!;
  const slot = g.slots[selected]!;
  const label = "fill-ink-2 text-micro";
  const figure = g.compact ? "text-[10px] font-bold" : "text-micro font-bold";

  const bracket = (span: readonly YearMonth[], name: string) => {
    const first = months.findIndex((m) => m.month === span[0]);
    const end = months.findIndex((m) => m.month === span[span.length - 1]);
    if (first < 0 || end < 0) return null;
    const a = g.slots[first]!.x + 6;
    const b = g.slots[end]!.x + g.slots[end]!.width - 6;
    const text = g.compact
      ? `${name} · ${shortMonth(span[0]!)}–${shortMonth(span[span.length - 1]!)}`
      : `${name} ${monthsCount(span.length)} · ${monthSpan(span)}`;
    return (
      <g key={name}>
        <path
          d={`M${a} ${g.bracketY - 5} V${g.bracketY} H${b} V${g.bracketY - 5}`}
          fill="none"
          className="stroke-line-strong"
        />
        <text x={(a + b) / 2} y={g.bracketY + 15} textAnchor="middle" className={label}>
          {text}
        </text>
      </g>
    );
  };

  return (
    <svg
      aria-hidden
      width={g.width}
      height={g.height}
      viewBox={`0 0 ${g.width} ${g.height}`}
      className="block overflow-visible"
    >
      <defs>
        <pattern
          id={hatch}
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="5" height="5" className="fill-surface" />
          <rect width="1.2" height="5" className="fill-ocean" />
        </pattern>
      </defs>

      {g.ticks.map((t) => (
        <g key={t.value}>
          <line
            x1={g.plot.left}
            x2={g.plot.right}
            y1={t.y}
            y2={t.y}
            className={t.value === 0 ? "stroke-line-strong" : "stroke-line"}
          />
          <text x={g.plot.left - 8} y={t.y + 4} textAnchor="end" className={label}>
            {axisAmount(t.value)}
          </text>
        </g>
      ))}

      {g.wentOut.map((r, i) => (
        <rect key={`o${i}`} {...r} className="fill-tide" opacity={0.28} />
      ))}
      {g.gaps.map((r, i) =>
        r === null ? null : r.kind === "left" ? (
          <rect
            key={`g${i}`}
            x={r.x}
            y={r.y}
            width={r.width}
            height={r.height}
            className="fill-mist"
          />
        ) : (
          <rect
            key={`g${i}`}
            x={r.x + 1}
            y={r.y + 1}
            width={Math.max(0, r.width - 2)}
            height={Math.max(0, r.height - 2)}
            fill={`url(#${hatch})`}
            className="stroke-ocean"
            strokeWidth={1.5}
          />
        ),
      )}
      <path d={g.spendingPath} fill="none" className="stroke-ocean" strokeWidth={2} />
      <path d={g.incomePath} fill="none" className="stroke-navy" strokeWidth={2.75} />

      {/* The month shown in the statement. */}
      <rect
        x={slot.x + 1}
        y={g.plot.top - 10}
        width={Math.max(0, slot.width - 2)}
        height={g.baseline - g.plot.top + 10}
        rx={4}
        fill="none"
        className="stroke-ocean"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <path d={`M${slot.centre - 5} ${g.plot.top - 16} h10 l-5 6 z`} className="fill-ocean" />

      {g.peaks.income && (
        <text
          x={g.peaks.income.x}
          y={g.peaks.income.y}
          textAnchor="middle"
          className={cn(figure, "fill-ink")}
        >
          {formatMoney(months[g.peaks.income.month]!.income)}
        </text>
      )}
      {g.peaks.spending && (
        <text
          x={g.peaks.spending.x}
          y={g.peaks.spending.y}
          textAnchor="middle"
          className={cn(figure, "fill-ink-2")}
        >
          {formatMoney(months[g.peaks.spending.month]!.spending)}
        </text>
      )}
      {g.endLabels && (
        <>
          <text
            x={g.endLabels.x}
            y={g.endLabels.incomeY - 2}
            className="fill-ink-2 text-micro font-semibold"
          >
            Came in
          </text>
          <text
            x={g.endLabels.x}
            y={g.endLabels.incomeY + 13}
            className="fill-ink text-meta font-bold"
          >
            {formatMoney(last.income)}
          </text>
          <text
            x={g.endLabels.x}
            y={g.endLabels.spendingY + 4}
            className="fill-ink-2 text-micro font-semibold"
          >
            Went out
          </text>
          <text
            x={g.endLabels.x}
            y={g.endLabels.spendingY + 19}
            className="fill-ink text-meta font-bold"
          >
            {formatMoney(last.spending)}
          </text>
        </>
      )}

      {months.map((m, i) => {
        const s = g.slots[i]!;
        const year = i === 0 || m.month.endsWith("-01");
        return (
          <g key={m.month}>
            <text
              x={s.centre}
              y={g.monthLabelY}
              textAnchor="middle"
              className={cn(label, i === selected ? "fill-ocean font-bold" : "font-medium")}
            >
              {g.initials ? shortMonth(m.month)[0] : shortMonth(m.month)}
            </text>
            {year && !g.initials && (
              <text
                x={s.centre}
                y={g.monthLabelY + 13}
                textAnchor="middle"
                className="fill-ink-2 text-[10px]"
              >
                {m.month.slice(0, 4)}
              </text>
            )}
          </g>
        );
      })}

      {/* Beside the lane when there is a margin for it; above it on narrow drawings. */}
      <text
        x={g.compact ? g.plot.left : g.plot.left - 8}
        y={g.compact ? g.lane.top - 2 : g.lane.top + 4}
        textAnchor={g.compact ? "start" : "end"}
        className="fill-navy text-micro font-semibold"
      >
        Left over
      </text>
      <line
        x1={g.plot.left}
        x2={g.plot.right}
        y1={g.lane.zero}
        y2={g.lane.zero}
        className="stroke-line-strong"
      />
      {g.lane.bars.map((b, i) => {
        const m = months[i]!;
        const labelY =
          m.leftOver >= 0 ? (b ? b.y : g.lane.zero) - 5 : (b ? b.y + b.height : g.lane.zero) + 13;
        return (
          <g key={`l${i}`}>
            {b &&
              (b.kind === "left" ? (
                <rect
                  x={b.x}
                  y={b.y}
                  width={b.width}
                  height={b.height}
                  rx={3}
                  className="fill-navy"
                />
              ) : (
                <rect
                  x={b.x + 0.75}
                  y={b.y + 0.75}
                  width={Math.max(0, b.width - 1.5)}
                  height={Math.max(0, b.height - 1.5)}
                  rx={2}
                  fill={`url(#${hatch})`}
                  className="stroke-ocean"
                  strokeWidth={1.5}
                />
              ))}
            {g.lane.labelled[i] && (
              <text
                x={g.slots[i]!.centre}
                y={labelY}
                textAnchor="middle"
                className={cn(figure, m.leftOver < 0 ? "fill-ink" : "fill-navy")}
              >
                {formatMoney(m.leftOver)}
              </text>
            )}
          </g>
        );
      })}

      {halves && [bracket(halves.earlier, "Earlier"), bracket(halves.recent, "Recent")]}
    </svg>
  );
}
