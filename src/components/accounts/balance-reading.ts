import { accountClass, type AccountType } from "@/domain/ledger/accounts";
import { liabilityStanding } from "@/domain/ledger/position";
import type { Money } from "@/domain/money";

/**
 * How one account balance reads on Accounts. An asset shows its signed
 * balance. A liability shows a magnitude with the word that gives it its
 * direction — owed, or credit for a card paid past zero — and no word when
 * it is clear. The direction comes from the domain's `liabilityStanding`.
 */
export interface BalanceReading {
  readonly amount: Money;
  /** The `Money` sign mode: an asset keeps its minus; a liability's word carries it. */
  readonly sign: "negative" | "none";
  readonly note: "owed" | "credit" | null;
}

export function balanceReading(type: AccountType, balance: Money): BalanceReading {
  if (accountClass(type) === "asset") return { amount: balance, sign: "negative", note: null };
  const { kind, amount } = liabilityStanding(balance);
  return { amount, sign: "none", note: kind === "clear" ? null : kind };
}
