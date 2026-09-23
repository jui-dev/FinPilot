import { subtract, type Money } from "@/domain/money";

/**
 * Reconciliation: what the ledger says against what the person counted
 * (docs/domain-model.md §4.1, §6).
 *
 * The correcting adjustment is `stated − recorded` — the signed amount that
 * moves the derived balance onto the stated one. It corrects the balance **as of
 * the checkpoint date**: transactions dated after it are still later
 * transactions, and they keep affecting every subsequent balance.
 */
export interface Reconciliation {
  /** The balance derived from the ledger as of the checkpoint date. */
  readonly recorded: Money;
  /** The balance the person stated, signed like every other balance. */
  readonly stated: Money;
  /** `stated − recorded`: what it would take to make them agree. */
  readonly difference: Money;
  /** False when the ledger already agrees: record the checkpoint, post nothing. */
  readonly needsAdjustment: boolean;
}

export function reconcile(recorded: Money, stated: Money): Reconciliation {
  const difference = subtract(stated, recorded);
  return { recorded, stated, difference, needsAdjustment: difference !== 0 };
}
