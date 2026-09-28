import type { CalendarDate, DateRange, YearMonth } from "@/domain/calendar-date";
import type { AccountType } from "@/domain/ledger/accounts";
import type { CategoryChange } from "@/domain/ledger/month-over-month";
import type { Money } from "@/domain/money";

/**
 * Attention signals (docs/domain-model.md §11): what deserves the person's
 * attention right now, selected from facts the owning features already derive.
 * A signal is data only — kind, identity, parameters and where its evidence
 * lives. Copy and links are produced at presentation.
 *
 * There is no severity and no score: the kind of situation fixes both the
 * priority and the presentation tone.
 */

/** The V1 kinds, in their fixed priority order (first = highest). */
export const ATTENTION_KINDS = [
  "commitment_overdue",
  "commitment_due_today",
  "set_aside_short",
  "verification_changed",
  "commitment_due_soon",
  "spending_up",
  "unexplained_adjustment",
] as const;

export type AttentionKind = (typeof ATTENTION_KINDS)[number];

/** 1 for the first kind in ATTENTION_KINDS, 7 for the last. */
export const priorityOf = (kind: AttentionKind): number => ATTENTION_KINDS.indexOf(kind) + 1;

/**
 * Only kinds that nothing in the product resolves can be hidden. Every other
 * kind is resolved on its owning page (Pay, Skip, Release, correcting an
 * entry, Verify); hiding it would make Attention untrue.
 */
const DISMISSIBLE: ReadonlySet<AttentionKind> = new Set(["spending_up", "unexplained_adjustment"]);

export const isDismissible = (kind: AttentionKind): boolean => DISMISSIBLE.has(kind);

/**
 * Where a signal's evidence lives: the page that owns its explanation and the
 * action that resolves it. Never a URL — routing belongs to the presentation.
 */
export type AttentionEvidence =
  | { readonly page: "commitments" }
  | { readonly page: "set_aside" }
  /** Activity rows for one account over a half-open date range. */
  | { readonly page: "activity"; readonly accountId: string; readonly range: DateRange }
  /** Cash flow's What changed for a month. */
  | { readonly page: "cash_flow_change"; readonly month: YearMonth };

// ---------------------------------------------------------------------------
// Signals, one shape per kind
// ---------------------------------------------------------------------------

interface SignalBase<K extends AttentionKind> {
  readonly kind: K;
  /**
   * `kind : subject`, plus the episode where the kind has one. Built only from
   * ids and dates, never from amounts, so a changed amount keeps its key.
   */
  readonly key: string;
  /** priorityOf(kind). */
  readonly priority: number;
  readonly dismissible: boolean;
  readonly evidence: AttentionEvidence;
}

/** One commitment's pending occurrences that were due before today. */
export interface CommitmentOverdueSignal extends SignalBase<"commitment_overdue"> {
  readonly commitmentId: string;
  readonly name: string;
  /** The overdue occurrences, oldest first. */
  readonly occurrenceIds: readonly string[];
  readonly oldestDueOn: CalendarDate;
  /** Days from the oldest due date to today. */
  readonly daysOverdue: number;
  /** Σ expected amounts of the overdue occurrences. */
  readonly total: Money;
}

export interface CommitmentDueSignal<
  K extends "commitment_due_today" | "commitment_due_soon",
> extends SignalBase<K> {
  readonly occurrenceId: string;
  readonly commitmentId: string;
  readonly name: string;
  readonly dueOn: CalendarDate;
  /** 0 when due today; 1–7 when due soon. */
  readonly daysUntil: number;
  readonly amount: Money;
}

/** One (item, account) earmark whose account no longer backs all of it. */
export interface SetAsideShortSignal extends SignalBase<"set_aside_short"> {
  readonly itemId: string;
  readonly itemName: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly reserved: Money;
  readonly covered: Money;
  readonly short: Money;
}

/** An account's current checkpoint no longer matches the ledger. */
export interface VerificationChangedSignal extends SignalBase<"verification_changed"> {
  readonly accountId: string;
  readonly accountName: string;
  readonly accountType: AccountType;
  readonly asOf: CalendarDate;
  readonly stated: Money;
  readonly recorded: Money;
  /** recorded − stated (the verification's drift). */
  readonly drift: Money;
}

/** This month's spending is materially above the same days of last month. */
export interface SpendingUpSignal extends SignalBase<"spending_up"> {
  readonly month: YearMonth;
  /** The same days of the previous month (half-open). */
  readonly comparisonRange: DateRange;
  readonly previousTotal: Money;
  readonly currentTotal: Money;
  readonly net: Money;
  readonly grossIncreases: Money;
  /** What changed's material increases, largest first, with their share. */
  readonly drivers: readonly CategoryChange[];
  /** What changed's material offsets, largest decrease first. */
  readonly offsets: readonly CategoryChange[];
}

/** A recent verification that needed a correcting adjustment. */
export interface UnexplainedAdjustmentSignal extends SignalBase<"unexplained_adjustment"> {
  readonly accountId: string;
  readonly accountName: string;
  readonly accountType: AccountType;
  readonly asOf: CalendarDate;
  readonly adjustmentId: string;
  /** The adjustment as posted: negative when the account held less than recorded. */
  readonly amount: Money;
}

export type AttentionSignal =
  | CommitmentOverdueSignal
  | CommitmentDueSignal<"commitment_due_today">
  | CommitmentDueSignal<"commitment_due_soon">
  | SetAsideShortSignal
  | VerificationChangedSignal
  | SpendingUpSignal
  | UnexplainedAdjustmentSignal;

/** The common fields every signal carries, filled in from its kind. */
export function signalBase<K extends AttentionKind>(
  kind: K,
  subject: readonly string[],
  evidence: AttentionEvidence,
): SignalBase<K> {
  return {
    kind,
    key: [kind, ...subject].join(":"),
    priority: priorityOf(kind),
    dismissible: isDismissible(kind),
    evidence,
  };
}
