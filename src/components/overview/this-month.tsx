import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import type { DateRange } from "@/domain/calendar-date";
import { formatMoney, type Money as MoneyValue } from "@/domain/money";
import type { MonthlyCashFlow } from "@/server/services/analysis-service";

import { activityHref } from "../activity/links";
import { listOf } from "../available/describe";
import { periodNote } from "../cash-flow/labels";
import { rangeLabel } from "../format";
import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { monthJourney, type JourneyColumn, type JourneyPart } from "./describe";
import { ZoneHeader, ZoneLink } from "./zone-header";

type CashFlow = Pick<MonthlyCashFlow, "summary" | "period" | "sources" | "composition">;
type Journey = Extract<ReturnType<typeof monthJourney>, { kind: "journey" }>;

/**
 * "Where did money come from, where did it go, and what was left?" — the
 * month so far as a journey: Came in (tide) → Went out → Left over (navy).
 * Where the money went rises to the way, one warm column per category,
 * each as long as its amount on one scale: spending is normal outflow, never
 * a warning. Every figure is Cash flow's and is text; the line and columns are
 * hidden from assistive technology. From 768px the journey runs left to
 * right; on phones it runs down the page.
 */
export function ThisMonth({ cashFlow }: { readonly cashFlow: CashFlow }) {
  const journey = monthJourney(cashFlow);
  return (
    <section
      aria-labelledby="overview-month"
      className="rounded-panel border border-line-soft bg-surface p-5 shadow-card md:p-7"
    >
      <ZoneHeader
        id="overview-month"
        title="This month"
        note={periodNote(cashFlow.period)}
        action={<ZoneLink href="/cash-flow">Where it went in Cash flow</ZoneLink>}
      />
      {journey.kind === "empty" ? (
        <p className="mt-4 text-meta text-ink-2">Nothing has come in or gone out yet this month.</p>
      ) : (
        <>
          <Across journey={journey} cashFlow={cashFlow} />
          <Down journey={journey} cashFlow={cashFlow} />
        </>
      )}
    </section>
  );
}

/** Came in and Went out open their Activity rows; each figure names its period for a screen reader. */
function Figure({
  term,
  amount,
  href,
  range,
  size = "large",
}: {
  readonly term: string;
  readonly amount: MoneyValue;
  readonly href: string | null;
  readonly range: DateRange;
  /** "adaptive": a step smaller until 1024px, where the journey has less room. */
  readonly size?: "large" | "medium" | "adaptive";
}) {
  const className = cn(
    "font-bold whitespace-nowrap text-ink tabular-nums",
    size === "large"
      ? "text-display"
      : size === "medium"
        ? "text-figure"
        : "text-figure lg:text-display",
  );
  return href ? (
    <Link
      href={href}
      aria-label={`${term}, ${rangeLabel(range)}: ${formatMoney(amount)}`}
      className={cn(className, linkClass)}
    >
      <Money amount={amount} />
    </Link>
  ) : (
    <Money amount={amount} className={className} />
  );
}

/** "Salary ৳1,05,000 · Other Income ৳2,500", each opening its income rows. */
function Sources({ journey, range }: { readonly journey: Journey; readonly range: DateRange }) {
  if (journey.sources.length === 0) return null;
  return (
    <p className="mt-1 text-meta text-ink-2">
      {journey.sources.map((s, i) => (
        <span key={s.key}>
          {i > 0 && " · "}
          {s.name}{" "}
          <Link
            href={activityHref({ type: "income", categoryId: s.categoryId ?? undefined, range })}
            aria-label={`${s.name}: ${formatMoney(s.amount)}`}
            className={cn("font-semibold text-ink", linkClass)}
          >
            <Money amount={s.amount} />
          </Link>
        </span>
      ))}
    </p>
  );
}

/** A column's evidence: its Activity rows, or Cash flow for a group. */
function columnHref(c: JourneyPart, range: DateRange): string {
  return c.categoryId ? activityHref({ categoryId: c.categoryId, range }) : "/cash-flow";
}

function ColumnLabel({
  column,
  range,
  align = "center",
}: {
  readonly column: JourneyColumn;
  readonly range: DateRange;
  /** "row": name and amount on one line, for a phone's rows. */
  readonly align?: "center" | "row";
}) {
  return (
    <span
      className={cn(
        "leading-tight",
        align === "center"
          ? "block text-center"
          : "flex min-w-0 flex-1 items-baseline justify-between gap-2",
      )}
    >
      <span
        className={cn("text-meta text-ink-2", align === "center" ? "block" : "min-w-0 truncate")}
      >
        {column.name}
      </span>
      <Link
        href={columnHref(column, range)}
        aria-label={
          column.categoryId
            ? `${column.name}: ${formatMoney(column.amount)}`
            : `${column.count} more categories: ${formatMoney(column.amount)}`
        }
        className={cn("text-body font-bold whitespace-nowrap text-ink", linkClass)}
      >
        <Money amount={column.amount} />
      </Link>
    </span>
  );
}

/**
 * One warm ramp by size, never a colour per category: the largest column the
 * warmest (a pale coral tint), stepping down to sand for the smallest. It only
 * repeats the order the lengths already show; a group of small categories is
 * neutral and hatched. Spending is normal outflow, so nothing here is berry.
 */
function columnStyle(c: JourneyColumn, rank: number, of: number): CSSProperties {
  if (!c.categoryId) {
    return {
      backgroundColor: "var(--color-surface-subtle)",
      backgroundImage:
        "repeating-linear-gradient(135deg, transparent 0 5px, rgb(156 148 133 / 0.2) 5px 6px)",
      boxShadow: "inset 0 0 0 1px var(--color-line)",
    };
  }
  const warmth = of > 1 ? 24 * (1 - rank / (of - 1)) : 24;
  return {
    backgroundColor: `color-mix(in srgb, var(--color-coral) ${warmth}%, var(--color-surface-hover))`,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, color-mix(in srgb, var(--color-coral) ${warmth * 1.6}%, var(--color-line-strong)) 45%, transparent)`,
  };
}

/** How many columns take part in the ramp (a group does not). */
const ranked = (journey: Journey) => journey.columns.filter((c) => c.categoryId).length;

function RefundNote({ journey }: { readonly journey: Journey }) {
  if (journey.refunded.length === 0) return null;
  return (
    <p className="text-meta text-ink-2">
      Refunds in {listOf(journey.refunded)} were larger than what was spent there, so{" "}
      {journey.refunded.length === 1 ? "it has" : "they have"} no column.
    </p>
  );
}

/** How tall the longest column rises, in pixels. */
const RISE = 112;

/** The two-part grid the figures, columns and labels share, so they line up. */
const GRID =
  "grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-x-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]";

/** From 768px: left to right, with the columns rising to the way. */
function Across({ journey, cashFlow }: { readonly journey: Journey; readonly cashFlow: CashFlow }) {
  const { summary, period } = cashFlow;
  const { range } = period;
  const over = summary.leftOver < 0;
  return (
    <div data-testid="month-journey" className="mt-6 max-md:hidden">
      <div className={GRID}>
        <div>
          <p className="text-meta text-ink-2">Came in</p>
          <Figure
            term="Came in"
            amount={summary.income}
            href={summary.income !== 0 ? activityHref({ type: "income", range }) : null}
            range={range}
          />
          <Sources journey={journey} range={range} />
        </div>
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-meta text-ink-2">Went out</p>
            {/* No type filter: Activity's Spent total is expenses net of refunds, exactly this figure. */}
            <Figure
              term="Went out"
              amount={summary.spending}
              href={summary.spending !== 0 ? activityHref({ range }) : null}
              range={range}
              size="adaptive"
            />
            <p className="mt-1 text-meta text-ink-2">Net of refunds</p>
          </div>
          <div className="text-right">
            <p className="text-meta font-semibold text-navy">Left over</p>
            {/* A true minus when more went out; never berry: it is direction, not an error. */}
            <Money
              amount={summary.leftOver}
              className="text-display font-extrabold whitespace-nowrap text-navy tabular-nums"
            />
          </div>
        </div>
      </div>

      {/* Where it went: one row of columns rising to the way between Came in and Went out. */}
      <div aria-hidden className={cn(GRID, "mt-6")}>
        <div className="-mb-5 flex items-end gap-1.5 pr-1.5 pl-9" style={{ height: RISE }}>
          {journey.columns.map((c, i) => (
            <span
              key={c.key}
              className="block min-w-0 flex-1 rounded-t-xl"
              style={{
                height: Math.max(c.length * RISE, 8),
                ...columnStyle(c, i, ranked(journey)),
              }}
            />
          ))}
        </div>
      </div>

      {/* The way: tide while money comes in and goes out, navy for what is left. */}
      <div aria-hidden className="relative h-9">
        <span className="absolute top-1/2 right-2/5 left-3 h-1.5 -translate-y-1/2 rounded-full bg-tide lg:right-1/3" />
        <span
          className={cn(
            "absolute top-1/2 right-4 left-3/5 -translate-y-1/2 rounded-full lg:left-2/3",
            over ? "h-2 border-[1.5px] border-dashed border-ocean" : "h-1.5 bg-navy",
          )}
        />
        <span className="absolute top-1/2 left-0 size-7 -translate-y-1/2 rounded-full border-[5px] border-tide bg-surface" />
        <span className="absolute top-1/2 left-3/5 grid size-7 lg:left-2/3 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[5px] border-line-strong bg-surface text-meta leading-none font-bold text-line-strong">
          −
        </span>
        <span
          className={cn(
            "absolute top-1/2 right-0 grid size-9 -translate-y-1/2 place-items-center rounded-full text-body font-bold",
            over
              ? "border-[1.5px] border-dashed border-ocean bg-surface text-ocean"
              : "bg-navy text-white",
          )}
        >
          =
        </span>
      </div>

      <div className={GRID}>
        <ul className="mt-1 flex gap-1.5 pr-1.5 pl-9">
          {journey.columns.map((c) => (
            <li key={c.key} className="min-w-0 flex-1">
              <ColumnLabel column={c} range={range} />
            </li>
          ))}
        </ul>
        <div className="space-y-1">
          <p className="text-meta text-ink-2">
            Where it went, each column as tall as its amount — the largest in the warmest tone.
          </p>
          <RefundNote journey={journey} />
        </div>
      </div>
    </div>
  );
}

/** How far the longest column reaches on a phone, as a share of the row. */
const REACH = 0.58;

/** On phones: the same journey down the page, the columns hanging sideways from the way. */
function Down({ journey, cashFlow }: { readonly journey: Journey; readonly cashFlow: CashFlow }) {
  const { summary, period } = cashFlow;
  const { range } = period;
  const over = summary.leftOver < 0;
  const stop = (children: ReactNode, className: string) => (
    <span
      aria-hidden
      className={cn(
        "relative z-10 grid size-6 shrink-0 place-items-center rounded-full text-micro font-bold",
        className,
      )}
    >
      {children}
    </span>
  );
  return (
    <div data-testid="month-journey-down" className="relative mt-5 md:hidden">
      {/* The way, down the left edge. */}
      <span aria-hidden className="absolute top-3 bottom-24 left-2.25 w-1.5 rounded-full bg-tide" />
      <span
        aria-hidden
        className={cn(
          "absolute bottom-3 left-2.25 h-24 w-1.5 rounded-full",
          over ? "border-[1.5px] border-dashed border-ocean" : "bg-navy",
        )}
      />

      <div className="flex gap-4">
        {stop(null, "border-[4px] border-tide bg-surface")}
        <div className="min-w-0">
          <p className="text-meta text-ink-2">Came in</p>
          <Figure
            term="Came in"
            amount={summary.income}
            href={summary.income !== 0 ? activityHref({ type: "income", range }) : null}
            range={range}
            size="medium"
          />
          <Sources journey={journey} range={range} />
        </div>
      </div>

      <ul className="mt-2.5 pl-3.5">
        {journey.columns.map((c, i) => (
          <li key={c.key} className="flex h-8 items-center gap-2.5">
            <span
              aria-hidden
              className="h-5.5 shrink-0 rounded-r-[9px]"
              style={{
                width: `${Math.max(c.length * REACH * 100, 3)}%`,
                ...columnStyle(c, i, ranked(journey)),
              }}
            />
            <ColumnLabel column={c} range={range} align="row" />
          </li>
        ))}
      </ul>
      <div className="mt-2 pl-10">
        <RefundNote journey={journey} />
      </div>

      <div className="mt-4 flex gap-4">
        {stop("−", "border-[4px] border-line-strong bg-surface text-line-strong")}
        <div>
          <p className="text-meta text-ink-2">Went out · net of refunds</p>
          <Figure
            term="Went out"
            amount={summary.spending}
            href={summary.spending !== 0 ? activityHref({ range }) : null}
            range={range}
            size="medium"
          />
        </div>
      </div>

      <div className="mt-12 flex items-center gap-4">
        {stop(
          "=",
          over
            ? "border-[1.5px] border-dashed border-ocean bg-surface text-ocean"
            : "bg-navy text-white",
        )}
        <div>
          <p className="text-meta font-semibold text-navy">Left over</p>
          <Money
            amount={summary.leftOver}
            className="text-display font-extrabold whitespace-nowrap text-navy tabular-nums"
          />
        </div>
      </div>
    </div>
  );
}
