import type { CalendarDate } from "@/domain/calendar-date";
import type { Verification } from "@/domain/ledger/verification";
import { abs, type Money } from "@/domain/money";

/**
 * How an account's verification reads on Accounts. Every amount comes from the
 * derived `Verification`; nothing is recomputed here.
 *
 * A changed checkpoint shows how far off it is (`|drift|`, direction-neutral)
 * and the two amounts it compares: what the ledger now records for that day,
 * and what was verified. Direction is carried only by those two explicit
 * amounts, never by a word like "more" or "less", so the same copy is right
 * for assets and liabilities. It says nothing about which entries caused the
 * difference: without a revision log the ledger cannot know.
 */
export type VerificationView =
  | { readonly status: "never_verified" }
  | { readonly status: "verified"; readonly asOf: CalendarDate }
  | {
      readonly status: "changed";
      readonly asOf: CalendarDate;
      /** |recorded − stated|. */
      readonly off: Money;
      /** Signed as stored; `balanceReading` decides how each reads (owed, credit). */
      readonly recorded: Money;
      readonly verified: Money;
    };

export function verificationView(verification: Verification): VerificationView {
  const { status, asOf, stated, recorded, drift } = verification;
  if (status === "never_verified" || asOf === null) return { status: "never_verified" };
  if (status === "verified") return { status, asOf };
  return { status, asOf, off: abs(drift!), recorded: recorded!, verified: stated! };
}
