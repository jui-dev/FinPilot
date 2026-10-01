import { compareDates, rangeContains, type CalendarDate } from "@/domain/calendar-date";
import { WEEKDAYS, weekdayIndex, type Weekday } from "@/domain/calendar-weeks";
import type { OccurrenceDisplayState } from "@/domain/commitments/occurrences";
import { accountClass, type AccountType } from "@/domain/ledger/accounts";
import type { IncomeSource, SpendingComposition, CashFlowSummary } from "@/domain/ledger/cash-flow";
import { sum, type Money } from "@/domain/money";
import type { AvailableView } from "@/server/services/available-service";
import type { CalendarDue, MonthCalendar } from "@/server/services/calendar-service";

import { spokenForBar, type SegmentKind } from "../available/describe";

/**
 * How the Overview draws what the read models already say. Every amount is
 * a read model's (Available, the Calendar, Cash flow, the balances); nothing
 * here computes a financial figure. This only decides whether each visual can
 * say something true, groups what is too small to draw on its own into Other
 * (a sum of the read model's own amounts), and turns amounts into geometry.
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

/**
 * Month at a glance: the Calendar read model's month reduced to what a
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

// ---------------------------------------------------------------------------
// This month: what is left, and where it went
// ---------------------------------------------------------------------------

/** A place money came from or went to, or several grouped as "N more". */
export interface JourneyPart {
  readonly key: string;
  readonly name: string;
  readonly amount: Money;
  /** The category behind it; null for a group. */
  readonly categoryId: string | null;
  /** How many categories a group holds; 1 otherwise. */
  readonly count: number;
}

export interface JourneyColumn extends JourneyPart {
  /** Its length against what came in (or went out, when more did), 0–1. */
  readonly length: number;
}

/**
 * This month: what is left of what came in, and where the rest went, one
 * line per category on one scale — what came in, or what went out when more
 * did — so a category reads as the share of the month it took. The figures
 * are Cash flow's; the lines are its category lines above zero, the smallest
 * grouped. A category whose refunds exceeded its spending has no length to
 * draw, so it is named instead, never drawn.
 */
export type MonthJourney =
  | { readonly kind: "empty" }
  | {
      readonly kind: "journey";
      readonly sources: readonly JourneyPart[];
      readonly columns: readonly JourneyColumn[];
      /** Categories where refunds were larger than spending, by name. */
      readonly refunded: readonly string[];
    };

/** Categories listed on their own before the rest are grouped. */
export const JOURNEY_COLUMNS = 5;
/** Sources named on their own under Came in. */
export const JOURNEY_SOURCES = 2;

function grouped(
  lines: readonly { readonly categoryId: string; readonly name: string; readonly amount: Money }[],
  max: number,
): JourneyPart[] {
  const part = (l: (typeof lines)[number]): JourneyPart => ({
    key: l.categoryId,
    name: l.name,
    amount: l.amount,
    categoryId: l.categoryId,
    count: 1,
  });
  // Grouping one line would only rename it.
  if (lines.length <= max + 1) return lines.map(part);
  const rest = lines.slice(max);
  return [
    ...lines.slice(0, max).map(part),
    {
      key: "more",
      name: `${rest.length} more`,
      amount: sum(rest.map((l) => l.amount)),
      categoryId: null,
      count: rest.length,
    },
  ];
}

export function monthJourney(cashFlow: {
  readonly summary: Pick<CashFlowSummary, "income" | "spending">;
  readonly sources: readonly IncomeSource[];
  readonly composition: Pick<SpendingComposition, "spent" | "refundedMoreThanSpent">;
}): MonthJourney {
  const { spent, refundedMoreThanSpent } = cashFlow.composition;
  const { income, spending } = cashFlow.summary;
  if (income === 0 && spending === 0 && spent.length === 0 && refundedMoreThanSpent.length === 0)
    return { kind: "empty" };
  const parts = grouped(
    spent.filter((l) => l.amount > 0),
    JOURNEY_COLUMNS,
  );
  const scale = Math.max(income, spending, ...parts.map((p) => p.amount), 0);
  return {
    kind: "journey",
    sources: grouped(cashFlow.sources, JOURNEY_SOURCES),
    columns: parts.map((p) => ({ ...p, length: scale > 0 ? p.amount / scale : 0 })),
    refunded: refundedMoreThanSpent.map((l) => l.name),
  };
}

// ---------------------------------------------------------------------------
// Where you stand: Net worth = You own − You owe
// ---------------------------------------------------------------------------

export interface StandingAccount {
  readonly accountId: string;
  readonly name: string;
  readonly type: AccountType;
  readonly balance: Money;
  readonly archived: boolean;
}

export interface OweLine {
  readonly accountId: string;
  readonly name: string;
  /** What is owed, or the credit held, as a magnitude. */
  readonly amount: Money;
  readonly kind: "owed" | "credit";
  readonly archived: boolean;
}

/**
 * The accounts behind the position, as evidence: what you own (every open
 * asset account, and an archived one only while it still holds money),
 * largest first; and the cards that owe or hold credit, owed first. The
 * totals are the position's; this only arranges its accounts.
 */
export function standing(accounts: readonly StandingAccount[]): {
  readonly own: readonly StandingAccount[];
  readonly owe: readonly OweLine[];
} {
  return {
    own: accounts
      .filter((a) => accountClass(a.type) === "asset" && (!a.archived || a.balance !== 0))
      .sort((a, b) => b.balance - a.balance),
    owe: accounts
      .filter((a) => accountClass(a.type) === "liability" && a.balance !== 0)
      .map((a) => ({
        accountId: a.accountId,
        name: a.name,
        amount: (a.balance < 0 ? -a.balance : a.balance) as Money,
        kind: a.balance < 0 ? ("owed" as const) : ("credit" as const),
        archived: a.archived,
      }))
      .sort((a, b) => (a.kind === b.kind ? b.amount - a.amount : a.kind === "owed" ? -1 : 1)),
  };
}
