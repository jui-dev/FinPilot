import {
  addDays,
  compareDates,
  daysBetween,
  type CalendarDate,
  type YearMonth,
} from "@/domain/calendar-date";
import type { OccurrenceDisplayState } from "@/domain/commitments/occurrences";
import type { AccountType } from "@/domain/ledger/accounts";
import { byName } from "@/domain/ledger/cash-flow";
import type { ComparisonPeriod, SpendingChange } from "@/domain/ledger/month-over-month";
import type { Verification } from "@/domain/ledger/verification";
import { abs, fromMajor, sum, type Money } from "@/domain/money";

import {
  signalBase,
  type AttentionSignal,
  type CommitmentDueSignal,
  type CommitmentOverdueSignal,
  type SetAsideShortSignal,
  type SpendingUpSignal,
  type UnexplainedAdjustmentSignal,
  type VerificationChangedSignal,
} from "@/domain/signals/signals";

/**
 * Attention derivation (docs/domain-model.md §11): which of the facts the
 * owning features already derive deserve attention, in a fixed order.
 *
 * Every input is a fact another feature owns — occurrence states from
 * Commitments, backing from Protected money, checkpoint status from
 * reconciliation, the spending change from Cash flow's month-over-month
 * explanation. Nothing here recomputes a balance, a backing, an occurrence
 * state, a drift or a change; the rules only compare those outputs with dates
 * and thresholds.
 */

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

/** A commitment occurrence as Commitments reports it. */
export interface AttentionOccurrenceFact {
  readonly occurrenceId: string;
  readonly commitmentId: string;
  readonly name: string;
  readonly dueOn: CalendarDate;
  readonly expectedAmount: Money;
  /** Commitments' display state: upcoming, due today or overdue while pending. */
  readonly display: OccurrenceDisplayState;
}

/** One active earmark's backing as Protected money derives it. */
export interface AttentionEarmarkFact {
  readonly itemId: string;
  readonly itemName: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly reserved: Money;
  readonly covered: Money;
  readonly short: Money;
}

/** An account's current checkpoint, as reconciliation derives its status. */
export interface AttentionCheckpointFact {
  readonly accountId: string;
  readonly accountName: string;
  readonly accountType: AccountType;
  readonly openedOn: CalendarDate;
  readonly archived: boolean;
  readonly verification: Verification;
  /** The checkpoint's correcting adjustment while it is active; null when none was needed. */
  readonly adjustment: { readonly transactionId: string; readonly amount: Money } | null;
}

/** This month to date against the same days of last month, as Cash flow explains it. */
export interface AttentionSpendingFact {
  readonly month: YearMonth;
  readonly comparison: ComparisonPeriod;
  readonly change: SpendingChange;
}

export interface AttentionFacts {
  readonly today: CalendarDate;
  readonly occurrences: readonly AttentionOccurrenceFact[];
  readonly earmarks: readonly AttentionEarmarkFact[];
  readonly checkpoints: readonly AttentionCheckpointFact[];
  /** Null when there is no same-days comparison (for example the first month). */
  readonly spending: AttentionSpendingFact | null;
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** A pending occurrence due 1–7 days after today is due soon. */
export const DUE_SOON_DAYS = 7;

/** An adjustment is recent while its checkpoint is dated within the last 7 days. */
export const ADJUSTMENT_RECENT_DAYS = 7;

/** spending_up's absolute floor: ৳5,000. */
export const SPENDING_UP_FLOOR: Money = fromMajor(5_000);

/**
 * spending_up (O-2): the previous same-days total is above zero and the net
 * increase is at least max(৳5,000, 20% × that total). Exact integer
 * comparison: 5·net ≥ previous, in BigInt so it cannot overflow.
 */
export function isSpendingUp(net: Money, previousTotal: Money): boolean {
  return previousTotal > 0 && net >= SPENDING_UP_FLOOR && BigInt(net) * 5n >= BigInt(previousTotal);
}

// ---------------------------------------------------------------------------
// Rules, one per source
// ---------------------------------------------------------------------------

function commitmentSignals(
  today: CalendarDate,
  occurrences: readonly AttentionOccurrenceFact[],
): AttentionSignal[] {
  const signals: AttentionSignal[] = [];
  const overdue = new Map<string, AttentionOccurrenceFact[]>();

  for (const o of occurrences) {
    if (o.display === "overdue") {
      overdue.set(o.commitmentId, [...(overdue.get(o.commitmentId) ?? []), o]);
    } else if (o.display === "due_today") {
      signals.push(dueSignal("commitment_due_today", today, o));
    } else if (o.display === "upcoming" && daysBetween(today, o.dueOn) <= DUE_SOON_DAYS) {
      signals.push(dueSignal("commitment_due_soon", today, o));
    }
  }

  for (const [commitmentId, list] of overdue) {
    // A commitment has at most one occurrence per date, so the date orders them.
    const ordered = [...list].sort((a, b) => compareDates(a.dueOn, b.dueOn));
    const oldest = ordered[0]!;
    const signal: CommitmentOverdueSignal = {
      ...signalBase("commitment_overdue", [commitmentId], { page: "commitments" }),
      commitmentId,
      name: oldest.name,
      occurrenceIds: ordered.map((o) => o.occurrenceId),
      oldestDueOn: oldest.dueOn,
      daysOverdue: daysBetween(oldest.dueOn, today),
      total: sum(ordered.map((o) => o.expectedAmount)),
    };
    signals.push(signal);
  }
  return signals;
}

function dueSignal<K extends "commitment_due_today" | "commitment_due_soon">(
  kind: K,
  today: CalendarDate,
  o: AttentionOccurrenceFact,
): CommitmentDueSignal<K> {
  return {
    ...signalBase(kind, [o.occurrenceId], { page: "commitments" }),
    occurrenceId: o.occurrenceId,
    commitmentId: o.commitmentId,
    name: o.name,
    dueOn: o.dueOn,
    daysUntil: daysBetween(today, o.dueOn),
    amount: o.expectedAmount,
  };
}

function shortSignals(earmarks: readonly AttentionEarmarkFact[]): SetAsideShortSignal[] {
  return earmarks
    .filter((e) => e.short > 0)
    .map((e) => ({
      ...signalBase("set_aside_short", [e.itemId, e.accountId], { page: "set_aside" }),
      itemId: e.itemId,
      itemName: e.itemName,
      accountId: e.accountId,
      accountName: e.accountName,
      reserved: e.reserved,
      covered: e.covered,
      short: e.short,
    }));
}

/**
 * At most one signal per checkpoint: a checkpoint that no longer matches is
 * only `verification_changed` — its adjustment was computed against a history
 * that has since changed. Archived accounts give none, because Verify is
 * refused on them. A missing or stale verification is never a signal.
 */
function checkpointSignal(
  today: CalendarDate,
  c: AttentionCheckpointFact,
): VerificationChangedSignal | UnexplainedAdjustmentSignal | null {
  const { status, asOf, stated, recorded, drift } = c.verification;
  if (c.archived || asOf === null) return null;

  if (status === "changed") {
    // The account's entries through the checkpoint date, as Accounts links them.
    const start = c.openedOn <= asOf ? c.openedOn : asOf;
    return {
      ...signalBase("verification_changed", [c.accountId, asOf], {
        page: "activity",
        accountId: c.accountId,
        range: { start, end: addDays(asOf, 1) },
      }),
      accountId: c.accountId,
      accountName: c.accountName,
      accountType: c.accountType,
      asOf,
      stated: stated!,
      recorded: recorded!,
      drift: drift!,
    };
  }

  if (
    status === "verified" &&
    c.adjustment !== null &&
    c.adjustment.amount !== 0 &&
    asOf >= addDays(today, -ADJUSTMENT_RECENT_DAYS)
  ) {
    return {
      ...signalBase("unexplained_adjustment", [c.adjustment.transactionId], {
        page: "activity",
        accountId: c.accountId,
        range: { start: asOf, end: addDays(asOf, 1) },
      }),
      accountId: c.accountId,
      accountName: c.accountName,
      accountType: c.accountType,
      asOf,
      adjustmentId: c.adjustment.transactionId,
      amount: c.adjustment.amount,
    };
  }
  return null;
}

/** At most one per month, about total spending, and only for an increase. */
function spendingSignal(spending: AttentionSpendingFact | null): SpendingUpSignal | null {
  if (spending === null || spending.comparison.kind !== "same_days") return null;
  const { change } = spending;
  if (!isSpendingUp(change.net, change.previousTotal)) return null;
  return {
    ...signalBase("spending_up", [spending.month], {
      page: "cash_flow_change",
      month: spending.month,
    }),
    month: spending.month,
    comparisonRange: spending.comparison.range,
    previousTotal: change.previousTotal,
    currentTotal: change.currentTotal,
    net: change.net,
    grossIncreases: change.grossIncreases,
    drivers: change.increases.filter((l) => l.material),
    offsets: change.offsets.filter((l) => l.material),
  };
}

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

/** The name a signal is sorted by after its kind's own tie-breaker. */
function nameOf(s: AttentionSignal): string {
  switch (s.kind) {
    case "commitment_overdue":
    case "commitment_due_today":
    case "commitment_due_soon":
      return s.name;
    case "set_aside_short":
      return s.itemName;
    case "verification_changed":
    case "unexplained_adjustment":
      return s.accountName;
    case "spending_up":
      return "";
  }
}

/** The kind's own tie-breaker (docs/domain-model.md §11); 0 when it has none. */
function byKindRule(a: AttentionSignal, b: AttentionSignal): number {
  if (a.kind === "commitment_overdue" && b.kind === "commitment_overdue") {
    return compareDates(a.oldestDueOn, b.oldestDueOn);
  }
  if (
    (a.kind === "commitment_due_today" || a.kind === "commitment_due_soon") &&
    a.kind === b.kind
  ) {
    return compareDates(a.dueOn, (b as typeof a).dueOn);
  }
  if (a.kind === "set_aside_short" && b.kind === "set_aside_short") return b.short - a.short;
  if (a.kind === "verification_changed" && b.kind === "verification_changed") {
    return abs(b.drift) - abs(a.drift);
  }
  return 0;
}

/**
 * Fixed priority by kind, then the kind's tie-breaker, then name, then key:
 * a total order, independent of the order the facts arrive in.
 */
export function compareSignals(a: AttentionSignal, b: AttentionSignal): number {
  return (
    a.priority - b.priority ||
    byKindRule(a, b) ||
    byName({ name: nameOf(a) }, { name: nameOf(b) }) ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/** Every signal the facts support, in priority order. Computed on read; nothing is stored. */
export function deriveAttention(facts: AttentionFacts): AttentionSignal[] {
  const signals: AttentionSignal[] = [
    ...commitmentSignals(facts.today, facts.occurrences),
    ...shortSignals(facts.earmarks),
    ...facts.checkpoints.flatMap((c) => checkpointSignal(facts.today, c) ?? []),
    ...[spendingSignal(facts.spending)].flatMap((s) => s ?? []),
  ];

  const keys = new Set<string>();
  for (const s of signals) {
    if (keys.has(s.key)) throw new RangeError(`Attention signal ${s.key} appears twice.`);
    keys.add(s.key);
  }
  return signals.sort(compareSignals);
}
