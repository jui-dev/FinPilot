import type { CalendarDate } from "@/domain/calendar-date";

/**
 * Business / list order of ledger rows: by date, then by recording order.
 *
 * - UUID       = identity (never compared for order)
 * - sequence   = deterministic per-owner recording order (immutable)
 * - (occurredOn, sequence) = business order — total and deterministic
 */
export interface Ordered {
  readonly occurredOn: CalendarDate;
  readonly sequence: number;
}

export function compareLedgerOrder(a: Ordered, b: Ordered): -1 | 0 | 1 {
  if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? -1 : 1;
  if (a.sequence !== b.sequence) return a.sequence < b.sequence ? -1 : 1;
  return 0;
}
