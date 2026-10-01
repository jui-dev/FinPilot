import Link from "next/link";
import type { CSSProperties } from "react";

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
 * "How much of what came in is left, and where did the rest go?" — built like
 * Where you stand: Left over leads on a mist panel, with what came in and went
 * out in words and one to-scale bar of the two; beside it, where it went, each
 * category's line measured against what came in, so a category reads as the
 * share of the month it took. Spending is normal outflow, never a warning.
 * Every figure is Cash flow's and is text; the bars are hidden from assistive
 * technology. From 1024px the two sit side by side; below, they stack.
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
        <div
          data-testid="month-journey"
          className="mt-4 grid gap-5 md:mt-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10"
        >
          <Kept journey={journey} cashFlow={cashFlow} />
          <WhereItWent journey={journey} cashFlow={cashFlow} />
        </div>
      )}
    </section>
  );
}

/** Came in and Went out open their Activity rows; each names its period for a screen reader. */
function FigureLink({
  term,
  amount,
  href,
  range,
  className,
}: {
  readonly term: string;
  readonly amount: MoneyValue;
  readonly href: string | null;
  readonly range: DateRange;
  readonly className: string;
}) {
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

const cameInHref = (c: CashFlow) =>
  c.summary.income !== 0 ? activityHref({ type: "income", range: c.period.range }) : null;
// No type filter: Activity's Spent total is expenses net of refunds, exactly this figure.
const wentOutHref = (c: CashFlow) =>
  c.summary.spending !== 0 ? activityHref({ range: c.period.range }) : null;

/** Left over on its mist panel, the month in words, and the bar of the two. */
function Kept({ journey, cashFlow }: { readonly journey: Journey; readonly cashFlow: CashFlow }) {
  const { summary, period } = cashFlow;
  const { range } = period;
  const over = summary.leftOver < 0;
  const figure = "font-semibold whitespace-nowrap text-ink tabular-nums";
  const cameIn = (
    <FigureLink
      term="Came in"
      amount={summary.income}
      href={cameInHref(cashFlow)}
      range={range}
      className={figure}
    />
  );
  const wentOut = (
    <FigureLink
      term="Went out"
      amount={summary.spending}
      href={wentOutHref(cashFlow)}
      range={range}
      className={figure}
    />
  );
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-6 rounded-2xl px-5 py-6 md:px-7 md:py-7",
        // More went out: outlined, never berry — it is direction, not an error.
        over
          ? "border-[1.5px] border-dashed border-ocean bg-surface"
          : "bg-[linear-gradient(150deg,var(--color-mist)_0%,color-mix(in_srgb,var(--color-mist)_35%,var(--color-surface))_55%,var(--color-surface)_100%)] shadow-[inset_0_0_0_1px_var(--color-line-soft)]",
      )}
    >
      <div>
        <p className="text-body font-semibold text-navy">
          {over ? "Went out more than came in" : "Left over"}
        </p>
        {/* A true minus when more went out. */}
        <Money
          amount={summary.leftOver}
          className="mt-1.5 block text-[clamp(2.5rem,4.5vw,3.5rem)] leading-none font-extrabold tracking-[-0.03em] whitespace-nowrap text-navy tabular-nums"
        />
        <p className="mt-4 text-body text-ink-2">
          {summary.income !== 0 ? (
            <>
              Of {cameIn} that came in, {wentOut} went out, net of refunds.
            </>
          ) : (
            <>Nothing has come in yet; {wentOut} went out, net of refunds.</>
          )}
        </p>
        <Sources journey={journey} range={range} />
      </div>
      <Meter journey={journey} cashFlow={cashFlow} />
    </div>
  );
}

/** "From Salary ৳1,05,000 · Other Income ৳2,500", each opening its income rows. */
function Sources({ journey, range }: { readonly journey: Journey; readonly range: DateRange }) {
  if (journey.sources.length === 0) return null;
  return (
    <p className="mt-1.5 text-meta text-ink-2">
      From{" "}
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

/**
 * The month as one bar: where it went, in the categories' tones, then what is
 * left in navy. The categories share Went out exactly (refunds can make their
 * lines add up to more), so the bar's split is the figures' split.
 */
function Meter({ journey, cashFlow }: { readonly journey: Journey; readonly cashFlow: CashFlow }) {
  const { spending, leftOver } = cashFlow.summary;
  const lines = journey.columns.reduce((n, c) => n + c.amount, 0);
  const share = lines > 0 ? Math.max(spending, 0) / lines : 0;
  const n = ranked(journey);
  return (
    <div aria-hidden>
      <div className="flex h-3 gap-0.75">
        {journey.columns.map((c, i) => (
          <span
            key={c.key}
            className="min-w-0.75 rounded-[3px] first:rounded-l-full last:rounded-r-full"
            style={{ flex: `${c.amount * share} 0 0`, ...lineStyle(c, i, n) }}
          />
        ))}
        {leftOver > 0 && (
          <span
            className="min-w-0.75 rounded-[3px] bg-navy first:rounded-l-full last:rounded-r-full"
            style={{ flex: `${leftOver} 0 0` }}
          />
        )}
      </div>
      <div className="mt-2 flex justify-between gap-4 text-micro text-ink-2">
        <span>Went out</span>
        {leftOver > 0 && <span>Left over</span>}
      </div>
    </div>
  );
}

/** A line's evidence: its Activity rows, or Cash flow for a group. */
function lineHref(c: JourneyPart, range: DateRange): string {
  return c.categoryId ? activityHref({ categoryId: c.categoryId, range }) : "/cash-flow";
}

/**
 * One warm ramp by size, never a colour per category: the largest line the
 * warmest (a pale coral tint), stepping down to sand for the smallest. It only
 * repeats the order the lengths already show; a group of small categories is
 * neutral and hatched. Spending is normal outflow, so nothing here is berry.
 */
function lineStyle(c: JourneyColumn, rank: number, of: number): CSSProperties {
  if (!c.categoryId) {
    return {
      backgroundColor: "var(--color-surface-hover)",
      backgroundImage:
        "repeating-linear-gradient(135deg, transparent 0 3px, rgb(156 148 133 / 0.35) 3px 4px)",
    };
  }
  const warmth = (of > 1 ? 26 * (1 - rank / (of - 1)) : 26) + 6;
  return {
    backgroundColor: `color-mix(in srgb, var(--color-coral) ${warmth}%, var(--color-surface-hover))`,
  };
}

/** How many lines take part in the ramp (a group does not). */
const ranked = (journey: Journey) => journey.columns.filter((c) => c.categoryId).length;

/** Where it went, a statement: each category, its line against what came in, and Went out. */
function WhereItWent({
  journey,
  cashFlow,
}: {
  readonly journey: Journey;
  readonly cashFlow: CashFlow;
}) {
  const { summary, period } = cashFlow;
  const { range } = period;
  const n = ranked(journey);
  const against = summary.spending > summary.income ? "what went out" : "what came in";
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-4 border-b border-line-soft pb-2.5">
        <h3 className="text-meta font-semibold text-ink-2">Where it went</h3>
        {journey.columns.length > 0 && (
          <p className="text-micro text-ink-3">Each line against {against}</p>
        )}
      </div>
      {journey.columns.length > 0 ? (
        <ul>
          {journey.columns.map((c, i) => (
            <li
              key={c.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line-soft py-2.5 md:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_6.5rem]"
            >
              <span className="truncate text-body text-ink">{c.name}</span>
              <span
                aria-hidden
                className="relative col-span-full row-start-2 h-1.5 overflow-hidden rounded-full bg-surface-subtle md:col-span-1 md:row-start-auto md:h-2.5"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${Math.max(c.length * 100, 1)}%`, ...lineStyle(c, i, n) }}
                />
              </span>
              <Link
                href={lineHref(c, range)}
                aria-label={
                  c.categoryId
                    ? `${c.name}: ${formatMoney(c.amount)}`
                    : `${c.count} more categories: ${formatMoney(c.amount)}`
                }
                className={cn(
                  "justify-self-end text-body font-bold whitespace-nowrap text-ink tabular-nums",
                  linkClass,
                )}
              >
                <Money amount={c.amount} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2.5 text-meta text-ink-2">Nothing has gone out yet this month.</p>
      )}
      <div className="-mt-px flex items-baseline justify-between gap-4 border-t-2 border-navy pt-3">
        <p className="text-body font-bold text-ink">
          Went out <span className="font-normal text-ink-2">· net of refunds</span>
        </p>
        <FigureLink
          term="Went out"
          amount={summary.spending}
          href={wentOutHref(cashFlow)}
          range={range}
          className="text-body font-bold whitespace-nowrap text-ink tabular-nums"
        />
      </div>
      <RefundNote journey={journey} />
    </div>
  );
}

function RefundNote({ journey }: { readonly journey: Journey }) {
  if (journey.refunded.length === 0) return null;
  return (
    <p className="mt-2 text-meta text-ink-2">
      Refunds in {listOf(journey.refunded)} were larger than what was spent there, so{" "}
      {journey.refunded.length === 1 ? "it isn't" : "they aren't"} listed.
    </p>
  );
}
