import type { CalendarDate } from "@/domain/calendar-date";
import { subtract, type Money } from "@/domain/money";

/**
 * Is an account still as verified? (docs/domain-model.md §12, §14.)
 *
 * A checkpoint says "on date D this account really held X". It still holds when
 * the balance the ledger *now* derives for date D is still X. That makes this
 * FinPilot's history-integrity mechanism: a backdated edit to anything dated on
 * or before D changes the derived balance and shows up here.
 *
 * Deliberately date-granular: a transaction recorded after the verification but
 * dated on the same day does change the status, because the balance at the end
 * of that day really is different now.
 *
 * **Sign convention — the opposite of reconciliation's.** Reconciliation asks
 * "what correction must I post?" and answers `stated − recorded`. Verification
 * asks "how far has the ledger moved away from what I verified?" and answers
 * `recorded − stated`. The two are negatives of each other, so they are named
 * differently — `difference` there, `drift` here — and must never be swapped.
 */
export type VerificationStatus = "never_verified" | "verified" | "changed";

export interface Verification {
  readonly status: VerificationStatus;
  /** The date of the checkpoint this status is about; null when never verified. */
  readonly asOf: CalendarDate | null;
  /** What the person stated on that date; null when never verified. */
  readonly stated: Money | null;
  /** What the ledger derives for that date today; null when never verified. */
  readonly recorded: Money | null;
  /** `recorded − stated`: how far the ledger has drifted. Zero when verified. */
  readonly drift: Money | null;
}

export const NEVER_VERIFIED: Verification = {
  status: "never_verified",
  asOf: null,
  stated: null,
  recorded: null,
  drift: null,
};

/**
 * The status of one checkpoint against the balance the ledger derives for its
 * date. The reconciliation adjustment is not excluded: it is dated `asOf`, so
 * it is part of that balance, and it was computed as exactly the amount that
 * makes this comparison equal — the predicate is true by construction. A
 * checkpoint that needed no adjustment satisfies it the same way.
 */
export function verificationOf(asOf: CalendarDate, stated: Money, recorded: Money): Verification {
  const drift = subtract(recorded, stated);
  return { status: drift === 0 ? "verified" : "changed", asOf, stated, recorded, drift };
}
