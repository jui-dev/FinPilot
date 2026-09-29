import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronDown, Minus } from "lucide-react";
import Link from "next/link";

import type { DateRange } from "@/domain/calendar-date";
import type { CategoryChange } from "@/domain/ledger/month-over-month";
import { abs, type Money as MoneyValue } from "@/domain/money";
import type { TrendChange } from "@/server/services/analysis-service";

import { activityHref } from "../activity/links";
import { CARD } from "../cash-flow/labels";
import { rangeLabel } from "../format";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { EmptyState } from "../ui/panel";
import { monthsCount, monthSpan } from "./describe";

interface Ranges {
  readonly earlier: DateRange;
  readonly recent: DateRange;
}

/**
 * "Why is the recent period different?" (Trends). The recent half of the
 * window against the earlier half, in exact totals, and the categories that
 * moved it: each one's move from the earlier half (an open ring) to the recent
 * half (a dot), on one scale, with its exact change. The explanation, the
 * materiality rule and every figure are the domain's; nothing is averaged, and
 * nothing is judged good or bad. Direction is carried by the sign, the word
 * and the arrow; colour only repeats it (navy higher, ocean lower).
 */
export function TrendWhatChanged({
  change,
  className,
}: {
  readonly change: TrendChange;
  readonly className?: string;
}) {
  const { earlier, recent, explanation: e } = change;
  const ranges = { earlier: earlier.range, recent: recent.range };
  const higher = e.increases.filter((l) => l.material);
  const lower = e.offsets.filter((l) => l.material);
  const smaller = [...e.increases, ...e.offsets].filter((l) => !l.material);
  const quiet = e.increases.length === 0 && e.offsets.length === 0 && e.unchanged.length === 0;
  // One scale for every track: from zero (or the lowest refund-heavy amount) to the highest.
  const levels = [...higher, ...lower].flatMap((l) => [l.previous, l.current]);
  const scale = { lo: Math.min(0, ...levels), hi: Math.max(0, ...levels) };
  const Icon = e.net > 0 ? ArrowUpRight : e.net < 0 ? ArrowDownRight : Minus;

  return (
    <section aria-labelledby="trends-change" className={cn(CARD, className)}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 pt-5 md:px-6">
        <h2 id="trends-change" className="text-heading font-bold text-navy">
          What changed
        </h2>
        <p className="text-body text-ink-2">
          The recent {monthsCount(recent.months.length)} against the earlier{" "}
          {monthsCount(earlier.months.length)}
        </p>
      </header>

      {quiet ? (
        <EmptyState title="Nothing went out in either half" />
      ) : (
        <>
          <div className="flex items-center gap-3 px-5 pt-4 md:px-6">
            <span
              aria-hidden
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-full",
                e.net === 0 ? "bg-surface-hover text-ink-2" : "bg-mist",
                e.net > 0 && "text-navy",
                e.net < 0 && "text-ocean",
              )}
            >
              <Icon className="size-5" strokeWidth={2.25} />
            </span>
            <p className="text-figure font-bold text-navy">
              {e.net === 0 ? (
                "The same went out"
              ) : (
                <>
                  <Money amount={abs(e.net)} sign="none" /> {e.net > 0 ? "more" : "less"} went out
                </>
              )}
            </p>
          </div>

          {/* The two halves, which also key the tracks below: a ring, then a dot. */}
          <dl className="mt-4 grid grid-cols-2 gap-px border-y border-line bg-line">
            <Half
              term={`Earlier ${monthsCount(earlier.months.length)}`}
              span={monthSpan(earlier.months)}
              total={e.previousTotal}
              range={earlier.range}
              mark="ring"
            />
            <Half
              term={`Recent ${monthsCount(recent.months.length)}`}
              span={monthSpan(recent.months)}
              total={e.currentTotal}
              range={recent.range}
              mark="dot"
            />
          </dl>

          {higher.length > 0 && (
            <Group title="Higher" tone="higher" lines={higher} scale={scale} ranges={ranges} />
          )}
          {lower.length > 0 && (
            <Group title="Lower" tone="lower" lines={lower} scale={scale} ranges={ranges} />
          )}

          {smaller.length > 0 && (
            <details className="group mx-5 mt-4 rounded-control bg-canvas md:mx-6">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-control px-4 py-3 transition-colors hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
                <ChevronDown
                  aria-hidden
                  className="size-4 shrink-0 text-ink-2 transition-transform group-open:rotate-180"
                />
                <span className="min-w-0 flex-1 text-body text-ink-2">
                  {smaller.length === 1 ? "1 smaller change" : `${smaller.length} smaller changes`}
                </span>
                <span className="text-body font-bold text-navy">
                  <Money amount={e.smallerChanges.net} sign="always" />
                </span>
              </summary>
              <ul aria-label="Smaller changes" className="border-t border-line pb-1">
                {smaller.map((line) => (
                  <Change key={line.categoryId} line={line} ranges={ranges} inset />
                ))}
              </ul>
            </details>
          )}
          {e.unchanged.length > 0 && (
            <p className="px-5 pt-4 text-body text-ink-2 md:px-6">
              No change: {listOf(e.unchanged.map((l) => l.name))}.
            </p>
          )}
          <div className="h-5" />
        </>
      )}
    </section>
  );
}

function Half({
  term,
  span,
  total,
  range,
  mark,
}: {
  readonly term: string;
  readonly span: string;
  readonly total: MoneyValue;
  readonly range: DateRange;
  readonly mark: "ring" | "dot";
}) {
  return (
    <div className={cn("px-5 py-3.5 md:px-6", mark === "dot" ? "bg-mist" : "bg-surface")}>
      <dt className="flex items-center gap-2 text-body text-ink-2">
        <Mark kind={mark} tone="higher" />
        {term}
      </dt>
      <dd className="mt-0.5 text-meta text-ink-2">{span}</dd>
      <dd className="mt-1">
        {/* Spending over the half: Activity's Spent is expenses net of refunds, exactly this total. */}
        <Link
          href={activityHref({ range })}
          className="rounded-control text-heading font-bold text-navy hover:underline focus-visible:outline-2 focus-visible:outline-ocean"
        >
          <span className="sr-only">Spending, {rangeLabel(range)}: </span>
          <Money amount={total} />
        </Link>
      </dd>
    </div>
  );
}

function Mark({
  kind,
  tone,
}: {
  readonly kind: "ring" | "dot";
  readonly tone: "higher" | "lower";
}) {
  return kind === "ring" ? (
    <span
      aria-hidden
      className="size-3 shrink-0 rounded-full border-2 border-line-strong bg-surface"
    />
  ) : (
    <span
      aria-hidden
      className={cn("size-3 shrink-0 rounded-full", tone === "higher" ? "bg-navy" : "bg-ocean")}
    />
  );
}

function Group({
  title,
  tone,
  lines,
  scale,
  ranges,
}: {
  readonly title: string;
  readonly tone: "higher" | "lower";
  readonly lines: readonly CategoryChange[];
  readonly scale: { readonly lo: number; readonly hi: number };
  readonly ranges: Ranges;
}) {
  return (
    <div className="mt-4">
      <h3 className="flex items-center gap-2 px-5 text-meta font-semibold text-ink-2 md:px-6">
        <span
          aria-hidden
          className={cn("size-2 rounded-full", tone === "higher" ? "bg-navy" : "bg-ocean")}
        />
        {title}
      </h3>
      <ul
        aria-label={
          tone === "higher" ? "Categories that were higher" : "Categories that were lower"
        }
      >
        {lines.map((line) => (
          <Change key={line.categoryId} line={line} ranges={ranges} track={{ scale, tone }} />
        ))}
      </ul>
    </div>
  );
}

/**
 * One category's move: its name and exact change, the move as a track (when
 * it is a driver), and both halves as evidence, each opening that category's
 * transactions in its own half.
 */
function Change({
  line,
  ranges,
  track,
  inset = false,
}: {
  readonly line: CategoryChange;
  readonly ranges: Ranges;
  readonly track?: {
    readonly scale: { readonly lo: number; readonly hi: number };
    readonly tone: "higher" | "lower";
  };
  readonly inset?: boolean;
}) {
  const evidence = (amount: MoneyValue, range: DateRange) => (
    <Link
      href={activityHref({ categoryId: line.categoryId, range })}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-body text-ink tabular-nums transition-colors hover:bg-mist hover:text-ocean",
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
        inset ? "px-4 py-2.5" : "px-5 py-3 md:px-6",
      )}
    >
      <span className="truncate font-semibold text-ink">{line.name}</span>
      <span className="text-heading font-bold whitespace-nowrap text-navy">
        <Money amount={line.change} sign="always" />
      </span>
      {track && <Track line={line} {...track} />}
      <span className="col-span-2 mt-2 flex items-center gap-1">
        {evidence(line.previous, ranges.earlier)}
        <ArrowRight aria-hidden className="size-3.5 text-ink-3" />
        {evidence(line.current, ranges.recent)}
      </span>
    </li>
  );
}

/** From the earlier half's amount (ring) to the recent half's (dot), on the card's one scale. */
function Track({
  line,
  scale,
  tone,
}: {
  readonly line: CategoryChange;
  readonly scale: { readonly lo: number; readonly hi: number };
  readonly tone: "higher" | "lower";
}) {
  const at = (v: number) =>
    scale.hi === scale.lo ? 0 : ((v - scale.lo) / (scale.hi - scale.lo)) * 100;
  const a = at(line.previous);
  const b = at(line.current);
  return (
    <span aria-hidden className="relative col-span-2 mx-1.5 mt-2.5 block h-3">
      <span className="absolute inset-x-0 top-[5px] h-0.5 rounded-full bg-line" />
      {scale.lo < 0 && (
        <span className="absolute top-0 h-3 w-px bg-line-strong" style={{ left: `${at(0)}%` }} />
      )}
      <span
        className={cn(
          "absolute top-1 h-1 rounded-full",
          tone === "higher" ? "bg-navy" : "bg-ocean",
        )}
        style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(b - a)}%` }}
      />
      <span
        className="absolute top-0 size-3 -translate-x-1/2 rounded-full border-2 border-line-strong bg-surface"
        style={{ left: `${a}%` }}
      />
      <span
        className={cn(
          "absolute top-0 size-3 -translate-x-1/2 rounded-full",
          tone === "higher" ? "bg-navy" : "bg-ocean",
        )}
        style={{ left: `${b}%` }}
      />
    </span>
  );
}

/** "Housing", "Housing and Health", "Housing, Health and Transport". */
function listOf(names: readonly string[]): string {
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
