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

export interface Position {
  readonly netWorth: Money;
  readonly assets: Money;
  /** Amount owed, as a positive number (−Σ liability balances). */
  readonly liabilities: Money;
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
  return { netWorth, assets, liabilities };
}
