import { compareDates, rangeContains, type CalendarDate } from "@/domain/calendar-date";
import { WEEKDAYS, weekdayIndex, type Weekday } from "@/domain/calendar-weeks";
import type { OccurrenceDisplayState } from "@/domain/commitments/occurrences";
import type { CashFlowSummary } from "@/domain/ledger/cash-flow";
import type { Money } from "@/domain/money";
import type { AvailableView } from "@/server/services/available-service";
import type { CalendarDue, MonthCalendar } from "@/server/services/calendar-service";

import { listOf, spokenForBar, type SegmentKind } from "../available/describe";

/**
 * How the Overview draws what the read models already say. Every amount is
 * the Available read model's or the position's; nothing here adds up money.
 * This only decides whether each visual can say something true, and turns the
 * amounts it is given into the fractions it is drawn with.
 */

/**
 * The Available ring: the money on hand (the bridge's pool) divided as the
 * Available page's spoken-for bar divides it, drawn clockwise from the top
 * with what is free first. Every amount and share is `spokenForBar`'s; this
 * only orders the parts and turns their shares into where each arc starts.
 * When more is spoken for than the pool holds, the over-commitment is the last
 * arc, as the bar's outlined gap is its last part. No ring when there is
 * nothing on hand, since there is nothing for the parts to be of.
 */
export type RingKind = SegmentKind | "over";

export interface RingArc {
  readonly kind: RingKind;
  readonly amount: Money;
  /** Where the arc starts and how much of the circle it takes, 0–1. Geometry only. */
  readonly start: number;
  readonly length: number;
}

export interface AvailableRing {
  readonly pool: Money;
  readonly arcs: readonly RingArc[];
}

const RING_ORDER: readonly SegmentKind[] = ["available", "owed", "payments", "setAside"];

export function availableRing(view: AvailableView): AvailableRing | null {
  const bar = spokenForBar(view);
  if (!bar) return null;
  const parts = [...bar.segments].sort(
    (a, b) => RING_ORDER.indexOf(a.kind) - RING_ORDER.indexOf(b.kind),
  );
  let at = 0;
  const arcs: RingArc[] = parts.map((s) => {
    const arc = { kind: s.kind, amount: s.amount, start: at, length: s.share };
    at += s.share;
    return arc;
  });
  if (bar.over) {
    arcs.push({
      kind: "over",
      amount: bar.over.amount,
      start: bar.over.from,
      length: 1 - bar.over.from,
    });
  }
  return { pool: bar.pool, arcs };
}

export interface RailPart {
  readonly amount: Money;
  /** Its part of the rail, 0–1. */
  readonly share: number;
}

/**
 * What you own, in two parts (docs/design-direction.md §5): the asset balances
 * that count toward Available and those outside it, both from the Available
 * read model, with the outside accounts named. Drawn only when both parts are
 * ≥ 0 and assets are above zero; otherwise a two-part rail cannot be true.
 */
export type AssetRail = {
  readonly counts: RailPart;
  readonly outside: RailPart & { readonly accounts: readonly string[] };
} | null;

export function assetRail(view: AvailableView, assets: Money): AssetRail {
  const { includedAssetBalances: counts, excludedAssetBalances: outside } = view;
  if (counts < 0 || outside < 0 || assets <= 0) return null;
  return {
    counts: { amount: counts, share: counts / assets },
    outside: {
      amount: outside,
      share: outside / assets,
      // Names only, for the words; the amount is the read model's.
      accounts: view.accounts
        .filter((a) => a.accountClass === "asset" && !a.counted && a.balance !== 0)
        .map((a) => a.name),
    },
  };
}

/** "Savings", "Savings and FD", or "Savings and 2 more" when there are more than two. */
export const shortNames = (names: readonly string[]): string =>
  names.length <= 2 ? listOf(names) : `${names[0]} and ${names.length - 1} more`;

/**
 * This month as a flow (docs/design-direction.md §5): what came in and what
 * went out on one scale, and the span between them — what was left over, or
 * how much more went out than came in. Only the Cash flow summary's own three
 * amounts are read; the fractions are geometry and are never shown as a rate.
 */
export type MonthFlow =
  | {
      readonly kind: "flow";
      /** Bar lengths, 0–1 of the longer of the two. */
      readonly cameIn: number;
      readonly wentOut: number;
      /** The span between the bar ends, as fractions; null when they are equal. */
      readonly gap: {
        readonly from: number;
        readonly to: number;
        /** "left": left over; "over": more went out than came in. */
        readonly kind: "left" | "over";
      } | null;
    }
  /** Nothing came in or went out yet. */
  | { readonly kind: "empty" }
  /** A total below zero (refunds larger than spending) cannot be drawn as a length. */
  | { readonly kind: "text" };

export function monthFlow(
  summary: Pick<CashFlowSummary, "income" | "spending" | "leftOver">,
): MonthFlow {
  const { income, spending, leftOver } = summary;
  if (income < 0 || spending < 0) return { kind: "text" };
  if (income === 0 && spending === 0) return { kind: "empty" };
  const scale = Math.max(income, spending);
  const cameIn = income / scale;
  const wentOut = spending / scale;
  return {
    kind: "flow",
    cameIn,
    wentOut,
    gap:
      leftOver > 0
        ? { from: wentOut, to: cameIn, kind: "left" }
        : leftOver < 0
          ? { from: cameIn, to: wentOut, kind: "over" }
          : null,
  };
}

/**
 * Your month at a glance: the Calendar read model's month reduced to what a
 * day can show without figures — today, whether money came in or went out
 * that day (income or spending, as Cash flow counts it; transfers are not
 * money in or out), and whether a payment is still due on it. Nothing is
 * summed here; the month's figures stay the read model's.
 */
export interface GlanceDay {
  readonly date: CalendarDate;
  readonly day: number;
  readonly today: boolean;
  /** The day whose evidence is open. */
  readonly selected: boolean;
  /** After today: nothing can have happened yet. */
  readonly later: boolean;
  readonly moved: boolean;
  /**
   * A payment still due that day: "attention" when one is overdue or due
   * today (a decision is needed), "expected" when it is only coming up.
   * Paid and skipped payments are settled and leave no mark.
   */
  readonly due: "attention" | "expected" | null;
}

export interface MonthGlance {
  readonly weekdays: readonly Weekday[];
  /** Seven places a week; null before the month's first day and after its last. */
  readonly weeks: readonly (readonly (GlanceDay | null)[])[];
  readonly movedDays: number;
  /** The payments still due in the month, overdue ones included, by due date. */
  readonly pending: readonly CalendarDue[];
}

const NEEDS_DECISION = new Set<OccurrenceDisplayState>(["overdue", "due_today"]);

export function monthGlance(
  calendar: MonthCalendar,
  selected: CalendarDate | null = null,
): MonthGlance {
  const { weekStartsOn, weeks, days, today } = calendar;
  const at = WEEKDAYS.indexOf(weekStartsOn);
  const glance = days.map((d): GlanceDay => {
    const pending = d.dues.filter(
      (due) => due.display === "upcoming" || NEEDS_DECISION.has(due.display),
    );
    return {
      date: d.date,
      day: Number(d.date.slice(8)),
      today: d.date === today,
      selected: d.date === selected,
      later: d.date > today,
      moved: d.money !== null && (d.money.income !== 0 || d.money.spending !== 0),
      due: pending.some((due) => NEEDS_DECISION.has(due.display))
        ? "attention"
        : pending.length > 0
          ? "expected"
          : null,
    };
  });
  return {
    weekdays: [...WEEKDAYS.slice(at), ...WEEKDAYS.slice(0, at)],
    weeks: weeks.map((week) => {
      const inWeek = glance.filter((d) => rangeContains(week.range, d.date));
      const lead = weekdayIndex(inWeek[0]!.date, weekStartsOn);
      return [
        ...Array<null>(lead).fill(null),
        ...inWeek,
        ...Array<null>(7 - lead - inWeek.length).fill(null),
      ];
    }),
    movedDays: glance.filter((d) => d.moved).length,
    pending: calendar.due.occurrences
      .filter((d) => d.display === "upcoming" || NEEDS_DECISION.has(d.display))
      .sort((a, b) => compareDates(a.dueOn, b.dueOn)),
  };
}
