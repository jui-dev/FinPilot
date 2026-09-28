import { add, negate, subtract, sum, ZERO, type Money } from "@/domain/money";

import { accountClass, type AccountType } from "./accounts";

/**
 * Financial position from account balances (docs/domain-model.md §5).
 * Balances are signed from the user's point of view (a liability is ≤ 0 when
 * money is owed), so net worth is simply their sum. Assets and liabilities are
 * grouped by account class, not by the sign of the balance.
 */
export interface AccountBalance {
  readonly accountId: string;
  readonly type: AccountType;
  readonly balance: Money;
}

/**
 * Which way a liability balance points: money owed, a credit balance (a card
 * paid past zero), or neither. `amount` is the magnitude; the kind carries the
 * direction, so no reader has to correct a sign.
 */
export interface LiabilityStanding {
  readonly kind: "owed" | "credit" | "clear";
  /** The amount owed, or the credit held; zero when clear. */
  readonly amount: Money;
}

/** Classifies a liability balance, signed as stored (≤ 0 when owed). */
export function liabilityStanding(signedBalance: Money): LiabilityStanding {
  if (signedBalance < 0) return { kind: "owed", amount: negate(signedBalance) };
  if (signedBalance > 0) return { kind: "credit", amount: signedBalance };
  return { kind: "clear", amount: ZERO };
}

export interface Position {
  readonly netWorth: Money;
  readonly assets: Money;
  /**
   * Net amount owed across liabilities (−Σ liability balances): positive when
   * owed, negative when cards hold more credit than is owed on them.
   */
  readonly liabilities: Money;
  /** The same total read as owed, credit or clear. */
  readonly liabilityStanding: LiabilityStanding;
}

export function summarizePosition(balances: readonly AccountBalance[]): Position {
  let assets = ZERO;
  let liabilityBalances = ZERO;
  for (const { type, balance } of balances) {
    if (accountClass(type) === "asset") assets = add(assets, balance);
    else liabilityBalances = add(liabilityBalances, balance);
  }
  const netWorth = sum(balances.map((b) => b.balance));
  const liabilities = negate(liabilityBalances);
  // Invariant: net worth = assets − liabilities.
  if (subtract(assets, liabilities) !== netWorth) throw new Error("position invariant violated");
  return { netWorth, assets, liabilities, liabilityStanding: liabilityStanding(liabilityBalances) };
}
