import { accountClass, type AccountType } from "@/domain/ledger/accounts";
import { add, subtract, ZERO, type Money } from "@/domain/money";

/**
 * Earmarks: reservations of real account money for a protected-money item
 * (docs/domain-model.md §9). Shown to the person as "Set aside".
 *
 * An earmark is never money: it touches no balance and no ledger row. It is
 * the sum of append-only signed entries for one (item, account) pair. A
 * positive entry reserves more (Reserve); a negative entry removes protection
 * (Release, full or partial). What real money actually backs a reservation is
 * derived at read time, so a falling balance shows up as a shortfall rather
 * than being blocked.
 */

export type EarmarkRuleCode =
  | "invalid_amount"
  | "item_not_found"
  | "item_archived"
  | "account_not_found"
  | "account_not_asset"
  | "account_archived"
  | "exceeds_balance"
  | "exceeds_reserved";

export interface EarmarkRuleViolation {
  readonly code: EarmarkRuleCode;
  readonly message: string;
}

/**
 * The facts one new entry is checked against, loaded inside the write
 * transaction. Amounts are the current earmarks before the entry is applied.
 */
export interface EarmarkEntryFacts {
  readonly item: { readonly archived: boolean } | undefined;
  readonly account: { readonly type: AccountType; readonly archived: boolean } | undefined;
  /** The account's current balance. */
  readonly accountBalance: Money;
  /** Σ current earmarks of every item on the account. */
  readonly reservedOnAccount: Money;
  /** This item's current earmark on the account. */
  readonly itemReservedOnAccount: Money;
}

const violation = (code: EarmarkRuleCode, message: string): EarmarkRuleViolation => ({
  code,
  message,
});

/**
 * The first write-time invariant a new entry breaks, or undefined when it may
 * be written. `amount` is the signed entry: positive reserves, negative releases.
 *
 * 1. Earmarks are allowed on asset accounts only.
 * 2. An item's earmark on an account never goes below zero.
 * 3. On an increase, Σ earmarks on the account ≤ the account's current balance,
 *    so the same money can never be set aside twice. A release is never
 *    checked against the balance: removing protection is always allowed.
 *
 * An archived item holds nothing (it archives only at zero) and takes no entries.
 * An archived account takes no new protection — setting money aside is new
 * activity — but a release from it is always allowed, so protected money can
 * never be trapped there. An archived account's balance is not assumed to be zero.
 */
export function checkEarmarkEntry(
  amount: Money,
  facts: EarmarkEntryFacts,
): EarmarkRuleViolation | undefined {
  if (!Number.isSafeInteger(amount) || amount === 0) {
    return violation("invalid_amount", "The amount must be more than zero.");
  }
  if (facts.item === undefined) {
    return violation("item_not_found", "That set-aside item does not exist.");
  }
  if (facts.item.archived) {
    return violation("item_archived", "That set-aside item is archived.");
  }
  if (facts.account === undefined) {
    return violation("account_not_found", "That account does not exist.");
  }
  if (accountClass(facts.account.type) !== "asset") {
    return violation("account_not_asset", "Money can only be set aside from an asset account.");
  }
  if (amount > 0) {
    if (facts.account.archived) {
      return violation("account_archived", "The account is archived.");
    }
    if (add(facts.reservedOnAccount, amount) > facts.accountBalance) {
      return violation(
        "exceeds_balance",
        "That is more than this account has left that is not already set aside.",
      );
    }
    return undefined;
  }
  if (add(facts.itemReservedOnAccount, amount) < 0) {
    return violation("exceeds_reserved", "That is more than is set aside from this account.");
  }
  return undefined;
}

/** One item's current earmark on an account (the sum of its entries). */
export interface AccountEarmark {
  readonly itemId: string;
  readonly reserved: Money;
}

/** An earmark split into the part real money backs and the part it does not. */
export interface BackedEarmark {
  readonly itemId: string;
  readonly reserved: Money;
  /** Backed by the account's balance: 0 ≤ covered ≤ reserved. */
  readonly covered: Money;
  /** reserved − covered. */
  readonly short: Money;
}

/**
 * Backing on one account (docs/domain-model.md §9): earmarks are backed in the
 * order given, each taking what the balance has left after the earlier ones:
 *
 *   covered_i = clamp(balance − Σ earlier reserved, 0, reserved_i)
 *
 * So Σ covered ≤ max(balance, 0), and a shortfall lands on the latest earmarks.
 *
 * The order given must be the established backing priority (oldest first):
 * when each (item, account) earmark was established by rising from zero. Increasing or partly
 * releasing an earmark keeps its place; one released to zero has ended, and
 * setting money aside again starts a new earmark behind the existing ones.
 * This function never reorders: not by amount, and never by id.
 */
export function backEarmarks(
  balance: Money,
  earmarksInBackingOrder: readonly AccountEarmark[],
): BackedEarmark[] {
  const seen = new Set<string>();
  let remaining = balance > 0 ? balance : ZERO;
  return earmarksInBackingOrder.map(({ itemId, reserved }) => {
    if (!Number.isSafeInteger(reserved) || reserved < 0) {
      throw new RangeError(`Earmark for ${itemId} is ${reserved}; an earmark is never negative.`);
    }
    if (seen.has(itemId)) {
      throw new RangeError(`Item ${itemId} appears twice on one account.`);
    }
    seen.add(itemId);
    const covered = reserved < remaining ? reserved : remaining;
    remaining = subtract(remaining, covered);
    return { itemId, reserved, covered, short: subtract(reserved, covered) };
  });
}
