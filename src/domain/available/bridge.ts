import { addDays, type CalendarDate } from "@/domain/calendar-date";
import type { OccurrenceState } from "@/domain/commitments/occurrences";
import { accountClass, type AccountClass, type AccountType } from "@/domain/ledger/accounts";
import { add, subtract, sum, ZERO, type Money } from "@/domain/money";

/**
 * Available (docs/domain-model.md §10): how much can be used now without
 * touching money that is already spoken for.
 *
 *   Available = Σ balance(included asset accounts)
 *             + Σ balance(liability accounts)          (≤ 0 when owed)
 *             − Σ expected amount(pending occurrences due ≤ today + 30)
 *             − Σ covered(earmarks on included asset accounts)
 *
 * This module only selects and sums. Every input is already derived by the
 * feature that owns it: balances by the ledger, occurrence state by
 * Commitments, covered by Protected money's backing. Nothing here computes a
 * balance, a schedule or a backing, and the result is never clamped or stored.
 */

/** Commitments due within this many days of today count, overdue ones included. */
export const AVAILABLE_HORIZON_DAYS = 30;

/** The last due date (inclusive) whose pending occurrences reduce Available. */
export const availableHorizonEnd = (today: CalendarDate): CalendarDate =>
  addDays(today, AVAILABLE_HORIZON_DAYS);

/**
 * Whether an account's balance, and any set aside on it, is within Available's
 * scope. A liability always is, whatever its stored flag, so a preference can
 * never hide debt (§5); an asset account follows its `included_in_available`.
 */
export const countsInAvailable = (type: AccountType, includedInAvailable: boolean): boolean =>
  accountClass(type) === "liability" || includedInAvailable;

export interface AvailableAccountInput {
  readonly accountId: string;
  readonly type: AccountType;
  readonly includedInAvailable: boolean;
  /** The account's current signed balance. */
  readonly balance: Money;
}

export interface AvailableOccurrenceInput {
  readonly occurrenceId: string;
  readonly dueOn: CalendarDate;
  readonly expectedAmount: Money;
  /** As Commitments derives it from the ledger (paid only while linked to an active expense). */
  readonly state: OccurrenceState;
}

export interface AvailableEarmarkInput {
  readonly itemId: string;
  readonly accountId: string;
  /** What the account's balance backs, as Protected money derives it (§9). */
  readonly covered: Money;
}

export interface AvailableInputs {
  readonly today: CalendarDate;
  readonly accounts: readonly AvailableAccountInput[];
  readonly occurrences: readonly AvailableOccurrenceInput[];
  readonly earmarks: readonly AvailableEarmarkInput[];
}

/** One account's part in the bridge. */
export interface AvailableAccountLine {
  readonly accountId: string;
  readonly type: AccountType;
  readonly accountClass: AccountClass;
  readonly balance: Money;
  /** In scope: every liability, and asset accounts with `included_in_available`. */
  readonly counted: boolean;
}

/** One pending occurrence the commitment term subtracts. */
export interface AvailableCommitmentLine {
  readonly occurrenceId: string;
  readonly dueOn: CalendarDate;
  readonly expectedAmount: Money;
}

/** One active earmark and whether its covered amount is deducted. */
export interface AvailableEarmarkLine {
  readonly itemId: string;
  readonly accountId: string;
  readonly covered: Money;
  /** Only earmarks on included asset accounts are deducted; money on excluded accounts is already outside the pool. */
  readonly deducted: boolean;
}

/**
 * The explainable bridge: each term, and the evidence it is summed from.
 *
 *   includedAssetBalances + liabilityBalances = balancesInScope
 *   balancesInScope − commitmentsDue − coveredEarmarks = available
 */
export interface AvailableBridge {
  readonly today: CalendarDate;
  readonly horizonEnd: CalendarDate;
  /** Σ balances of asset accounts included in Available. */
  readonly includedAssetBalances: Money;
  /**
   * Σ liability balances, signed as stored: negative when money is owed,
   * positive for a card holding a credit balance, zero when neither.
   */
  readonly liabilityBalances: Money;
  /** includedAssetBalances + liabilityBalances: every balance in scope, before obligations and earmarks. */
  readonly balancesInScope: Money;
  /** Σ expected amounts of pending occurrences due on or before horizonEnd, overdue ones included. */
  readonly commitmentsDue: Money;
  /** Σ covered amounts of earmarks on included asset accounts — never the nominal reserved amount. */
  readonly coveredEarmarks: Money;
  /** May be negative (over-committed); never clamped. */
  readonly available: Money;
  /** Every account, in input order, including those outside the pool. */
  readonly accounts: readonly AvailableAccountLine[];
  /** Exactly the occurrences commitmentsDue sums, in input order. */
  readonly commitments: readonly AvailableCommitmentLine[];
  /** Every active earmark, in input order; coveredEarmarks sums the deducted ones. */
  readonly earmarks: readonly AvailableEarmarkLine[];
}

export function availableBridge(inputs: AvailableInputs): AvailableBridge {
  const horizonEnd = availableHorizonEnd(inputs.today);

  const byId = new Map<string, AvailableAccountLine>();
  for (const a of inputs.accounts) {
    if (byId.has(a.accountId)) throw new RangeError(`Account ${a.accountId} appears twice.`);
    byId.set(a.accountId, {
      accountId: a.accountId,
      type: a.type,
      accountClass: accountClass(a.type),
      balance: a.balance,
      counted: countsInAvailable(a.type, a.includedInAvailable),
    });
  }
  const accounts = [...byId.values()];

  let includedAssetBalances = ZERO;
  let liabilityBalances = ZERO;
  for (const line of accounts) {
    if (line.accountClass === "liability") liabilityBalances = add(liabilityBalances, line.balance);
    else if (line.counted) includedAssetBalances = add(includedAssetBalances, line.balance);
  }
  const balancesInScope = add(includedAssetBalances, liabilityBalances);

  const commitments = inputs.occurrences
    .filter((o) => o.state === "pending" && o.dueOn <= horizonEnd)
    .map(({ occurrenceId, dueOn, expectedAmount }) => ({ occurrenceId, dueOn, expectedAmount }));
  const commitmentsDue = sum(commitments.map((c) => c.expectedAmount));

  const earmarks = inputs.earmarks.map(({ itemId, accountId, covered }) => {
    const account = byId.get(accountId);
    if (account === undefined) {
      throw new RangeError(`Earmark for ${itemId} is on unknown account ${accountId}.`);
    }
    if (account.accountClass !== "asset") {
      throw new RangeError(`Earmark for ${itemId} is on liability ${accountId}.`);
    }
    if (!Number.isSafeInteger(covered) || covered < 0) {
      throw new RangeError(`Earmark for ${itemId} covers ${covered}; covered is never negative.`);
    }
    return { itemId, accountId, covered, deducted: account.counted };
  });
  const coveredEarmarks = sum(earmarks.filter((e) => e.deducted).map((e) => e.covered));

  const available = subtract(subtract(balancesInScope, commitmentsDue), coveredEarmarks);

  // Invariant: the bridge equals the formula summed directly over the evidence.
  const direct = subtract(
    sum(accounts.filter((a) => a.counted).map((a) => a.balance)),
    add(commitmentsDue, coveredEarmarks),
  );
  if (direct !== available) throw new Error("Available bridge invariant violated");

  return {
    today: inputs.today,
    horizonEnd,
    includedAssetBalances,
    liabilityBalances,
    balancesInScope,
    commitmentsDue,
    coveredEarmarks,
    available,
    accounts,
    commitments,
    earmarks,
  };
}
