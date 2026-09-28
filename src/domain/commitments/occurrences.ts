import { addDays, type CalendarDate, type DateRange } from "@/domain/calendar-date";
import type { TransactionType } from "@/domain/ledger/transactions";
import type { Money } from "@/domain/money";

import { dueDatesIn, type CommitmentRule } from "./schedule";

/**
 * Occurrences: one expected instance of a commitment (docs/domain-model.md §8).
 *
 * An occurrence's outcome is never stored as "paid". What is stored is the
 * link to a ledger transaction and whether the person skipped it; whether it
 * is paid is derived from the ledger as it stands now. Deleting the linked
 * expense therefore returns the occurrence to pending with no write, and
 * restoring the expense makes it paid again. The ledger stays the only source
 * of truth for whether a payment exists.
 */
export type OccurrenceState = "pending" | "paid" | "skipped";

/** How a pending occurrence reads on a given day. */
export type PendingTiming = "upcoming" | "due_today" | "overdue";

/** What the person sees: the timing while pending, otherwise the outcome. */
export type OccurrenceDisplayState = PendingTiming | Exclude<OccurrenceState, "pending">;

/** The stored facts an occurrence's state is derived from. */
export interface OccurrenceOutcome {
  /** The person chose not to pay this one. */
  readonly skipped: boolean;
  /** The linked transaction as the ledger holds it now; null when none was ever linked. */
  readonly link: { readonly type: TransactionType; readonly deleted: boolean } | null;
}

/**
 * Paid only while the linked transaction is an active expense: a deleted
 * payment, or one since edited into something that is not spending, no longer
 * pays anything.
 */
export function occurrenceState(outcome: OccurrenceOutcome): OccurrenceState {
  if (outcome.skipped && outcome.link !== null) {
    throw new RangeError("An occurrence cannot be both skipped and linked to a transaction.");
  }
  if (outcome.skipped) return "skipped";
  if (outcome.link !== null && !outcome.link.deleted && outcome.link.type === "expense") {
    return "paid";
  }
  return "pending";
}

export function pendingTiming(dueOn: CalendarDate, today: CalendarDate): PendingTiming {
  if (dueOn > today) return "upcoming";
  return dueOn === today ? "due_today" : "overdue";
}

export function displayState(
  state: OccurrenceState,
  dueOn: CalendarDate,
  today: CalendarDate,
): OccurrenceDisplayState {
  return state === "pending" ? pendingTiming(dueOn, today) : state;
}

// ---------------------------------------------------------------------------
// Materialisation window and rule edits
// ---------------------------------------------------------------------------

/** Occurrences exist up to today + 60 days (docs/domain-model.md §8). */
export const MATERIALISATION_HORIZON_DAYS = 60;

/** The last day occurrences are materialised for, inclusive (Sep 22 → Nov 21). */
export const materialisedThrough = (today: CalendarDate): CalendarDate =>
  addDays(today, MATERIALISATION_HORIZON_DAYS);

/** An occurrence as stored, for planning a rule edit. */
export interface StoredOccurrence {
  readonly id: string;
  readonly dueOn: CalendarDate;
  readonly expectedAmount: Money;
  readonly skipped: boolean;
  /** Any transaction was ever linked, whether or not it is still active. */
  readonly linked: boolean;
}

/**
 * Untouched: never skipped and never linked. An occurrence whose linked
 * expense was later deleted reads as pending, but it carries a person's
 * action, so it counts as touched and is never regenerated.
 */
export const isUntouched = (occurrence: StoredOccurrence): boolean =>
  !occurrence.skipped && !occurrence.linked;

/**
 * Regenerable = untouched AND dueOn > today. Everything else is protected
 * from a rule edit: past, due today (it may already be being paid), paid,
 * skipped and ever-linked occurrences keep exactly what they were created with.
 */
export const isRegenerable = (occurrence: StoredOccurrence, today: CalendarDate): boolean =>
  isUntouched(occurrence) && occurrence.dueOn > today;

export interface RegenerationPlan {
  /** Occurrences to delete. Apply before `add`: a date may be removed and re-added. */
  readonly remove: readonly string[];
  /** Occurrences to create, in date order. */
  readonly add: readonly { readonly dueOn: CalendarDate; readonly expectedAmount: Money }[];
}

/**
 * What a rule edit changes (docs/domain-model.md §8): only future, pending,
 * untouched occurrences are regenerated. Paid, skipped, linked, due-today and
 * past occurrences are kept exactly as they are, and no date is added that one
 * of them already holds.
 *
 * Considers due dates in (today, today + 60]. An occurrence the new rule still
 * wants, with the same expected amount, is left alone.
 */
export function regenerationPlan(
  stored: readonly StoredOccurrence[],
  rule: CommitmentRule,
  today: CalendarDate,
): RegenerationPlan {
  const window: DateRange = {
    start: addDays(today, 1),
    end: addDays(materialisedThrough(today), 1),
  };
  const wanted = new Set(dueDatesIn(rule.schedule, window));

  const remove: string[] = [];
  const occupied = new Set<CalendarDate>();
  for (const occurrence of stored) {
    const keep =
      !isRegenerable(occurrence, today) ||
      (wanted.has(occurrence.dueOn) && occurrence.expectedAmount === rule.expectedAmount);
    if (keep) occupied.add(occurrence.dueOn);
    else remove.push(occurrence.id);
  }

  const add = [...wanted]
    .filter((dueOn) => !occupied.has(dueOn))
    .map((dueOn) => ({ dueOn, expectedAmount: rule.expectedAmount }));
  return { remove, add };
}
