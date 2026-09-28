import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  AVAILABLE_HORIZON_DAYS,
  availableBridge,
  availableHorizonEnd,
  countsInAvailable,
  type AvailableAccountInput,
  type AvailableEarmarkInput,
  type AvailableInputs,
  type AvailableOccurrenceInput,
} from "@/domain/available/bridge";
import { addDays, calendarDateFromIso, type CalendarDate } from "@/domain/calendar-date";
import {
  MATERIALISATION_HORIZON_DAYS,
  type OccurrenceState,
} from "@/domain/commitments/occurrences";
import { ACCOUNT_TYPES, accountClass, type AccountType } from "@/domain/ledger/accounts";
import { add, fromMajor, money, subtract, sum, type Money } from "@/domain/money";
import { backEarmarks } from "@/domain/protected-money/earmarks";

const taka = fromMajor;
const d = calendarDateFromIso;
const TODAY = d("2026-09-22");

const account = (
  accountId: string,
  type: AccountType,
  balanceTaka: number,
  includedInAvailable = type !== "savings",
): AvailableAccountInput => ({ accountId, type, includedInAvailable, balance: taka(balanceTaka) });

const occurrence = (
  occurrenceId: string,
  dueOn: string,
  amountTaka: number,
  state: OccurrenceState = "pending",
): AvailableOccurrenceInput => ({
  occurrenceId,
  dueOn: d(dueOn),
  expectedAmount: taka(amountTaka),
  state,
});

const inputs = (patch: Partial<AvailableInputs>): AvailableInputs => ({
  today: TODAY,
  accounts: [],
  occurrences: [],
  earmarks: [],
  ...patch,
});

/**
 * Covered amounts as Protected money derives them: the Stage 7 backing over
 * one account's balance, earmarks in priority order. The bridge never
 * computes backing itself; these tests feed it the real derivation.
 */
const backed = (
  accountId: string,
  balance: Money,
  reservedInPriorityOrder: readonly [itemId: string, reserved: Money][],
): AvailableEarmarkInput[] =>
  backEarmarks(
    balance,
    reservedInPriorityOrder.map(([itemId, reserved]) => ({ itemId, reserved })),
  ).map(({ itemId, covered }) => ({ itemId, accountId, covered }));

describe("horizon and scope", () => {
  it("counts commitments due up to today + 30 days, inside the materialised window", () => {
    expect(availableHorizonEnd(TODAY)).toBe("2026-10-22");
    expect(AVAILABLE_HORIZON_DAYS).toBeLessThanOrEqual(MATERIALISATION_HORIZON_DAYS);
  });

  it("always counts a liability; an asset account follows its flag", () => {
    expect(countsInAvailable("credit_card", true)).toBe(true);
    expect(countsInAvailable("credit_card", false)).toBe(true);
    for (const type of ["cash", "bank", "mobile_wallet", "savings"] as const) {
      expect(countsInAvailable(type, true)).toBe(true);
      expect(countsInAvailable(type, false)).toBe(false);
    }
  });
});

describe("availableBridge", () => {
  it("reproduces the September scenario bridge from its derived inputs", () => {
    const bridge = availableBridge(
      inputs({
        accounts: [
          account("bank", "bank", 133_000),
          account("cash", "cash", 4_200),
          account("bkash", "mobile_wallet", 8_963),
          account("savings", "savings", 90_000),
          account("visa", "credit_card", -6_000),
        ],
        occurrences: [
          occurrence("rent-sep", "2026-09-01", 30_000, "paid"),
          occurrence("internet-sep", "2026-09-25", 1_500),
          occurrence("rent-oct", "2026-10-01", 30_000),
          occurrence("streaming-oct", "2026-10-03", 700),
          occurrence("internet-oct", "2026-10-25", 1_500),
        ],
        earmarks: [
          ...backed("savings", taka(90_000), [["laptop", taka(100_000)]]),
          ...backed("bank", taka(133_000), [["laptop", taka(20_000)]]),
        ],
      }),
    );
    expect(bridge).toMatchObject({
      horizonEnd: "2026-10-22",
      includedAssetBalances: taka(146_163),
      liabilityBalances: taka(-6_000),
      balancesInScope: taka(140_163),
      commitmentsDue: taka(32_200),
      afterCommitments: taka(107_963),
      coveredEarmarks: taka(20_000),
      available: taka(87_963),
    });
    expect(bridge.commitments.map((c) => c.occurrenceId)).toEqual([
      "internet-sep",
      "rent-oct",
      "streaming-oct",
    ]);
    expect(bridge.earmarks).toEqual([
      { itemId: "laptop", accountId: "savings", covered: taka(90_000), deducted: false },
      { itemId: "laptop", accountId: "bank", covered: taka(20_000), deducted: true },
    ]);
    expect(bridge.accounts.find((a) => a.accountId === "savings")).toMatchObject({
      counted: false,
      balance: taka(90_000),
    });
  });

  it("is the balances in scope when there are no commitments and nothing set aside", () => {
    const bridge = availableBridge(
      inputs({
        accounts: [account("bank", "bank", 50_000), account("visa", "credit_card", -2_000)],
      }),
    );
    expect(bridge).toMatchObject({
      balancesInScope: taka(48_000),
      commitmentsDue: taka(0),
      coveredEarmarks: taka(0),
      available: taka(48_000),
    });
    expect(bridge.commitments).toEqual([]);
    expect(bridge.earmarks).toEqual([]);
  });

  it("counts pending occurrences due by the horizon end, overdue included; never paid or skipped", () => {
    const bridge = availableBridge(
      inputs({
        accounts: [account("bank", "bank", 100_000)],
        occurrences: [
          occurrence("overdue", "2026-07-01", 1_000),
          occurrence("today", "2026-09-22", 2_000),
          occurrence("last-day", "2026-10-22", 4_000),
          occurrence("day-after", "2026-10-23", 8_000),
          occurrence("paid", "2026-09-25", 16_000, "paid"),
          occurrence("skipped", "2026-09-26", 32_000, "skipped"),
        ],
      }),
    );
    expect(bridge.commitments.map((c) => c.occurrenceId)).toEqual(["overdue", "today", "last-day"]);
    expect(bridge.commitmentsDue).toBe(taka(7_000));
    expect(bridge.available).toBe(taka(93_000));
  });

  it("counts every liability whatever its stored flag, as its signed balance", () => {
    const owed = availableBridge(
      inputs({
        accounts: [account("bank", "bank", 10_000), account("visa", "credit_card", -3_000, false)],
      }),
    );
    expect(owed.accounts.find((a) => a.accountId === "visa")!.counted).toBe(true);
    expect(owed).toMatchObject({ liabilityBalances: taka(-3_000), available: taka(7_000) });

    // An overpaid card holds a credit balance; the formula takes it as stored.
    const overpaid = availableBridge(
      inputs({ accounts: [account("bank", "bank", 10_000), account("visa", "credit_card", 500)] }),
    );
    expect(overpaid).toMatchObject({ liabilityBalances: taka(500), available: taka(10_500) });

    const settled = availableBridge(
      inputs({ accounts: [account("bank", "bank", 10_000), account("visa", "credit_card", 0)] }),
    );
    expect(settled).toMatchObject({ liabilityBalances: taka(0), available: taka(10_000) });
  });

  it("leaves an excluded asset account, and money set aside on it, outside the pool", () => {
    const bridge = availableBridge(
      inputs({
        accounts: [account("bank", "bank", 10_000), account("savings", "savings", 90_000)],
        earmarks: backed("savings", taka(90_000), [["reserve", taka(50_000)]]),
      }),
    );
    expect(bridge).toMatchObject({
      includedAssetBalances: taka(10_000),
      coveredEarmarks: taka(0),
      available: taka(10_000),
    });
    expect(bridge.earmarks).toEqual([
      { itemId: "reserve", accountId: "savings", covered: taka(50_000), deducted: false },
    ]);
  });

  it("follows the flag, not the type: an included savings account and an excluded bank account", () => {
    const bridge = availableBridge(
      inputs({
        accounts: [
          account("savings", "savings", 5_000, true),
          account("bank", "bank", 7_000, false),
        ],
      }),
    );
    expect(bridge.available).toBe(taka(5_000));
  });

  it("goes negative when obligations exceed the pool, and is never clamped", () => {
    const bridge = availableBridge(
      inputs({
        accounts: [account("bank", "bank", 20_000), account("visa", "credit_card", -15_000)],
        occurrences: [occurrence("rent", "2026-10-01", 30_000)],
      }),
    );
    expect(bridge.available).toBe(taka(-25_000));
  });

  it("carries a negative included balance into Available", () => {
    const bridge = availableBridge(
      inputs({
        accounts: [account("bank", "bank", -5_000)],
        earmarks: backed("bank", taka(-5_000), [["laptop", taka(80_000)]]),
      }),
    );
    expect(bridge.earmarks[0]!.covered).toBe(taka(0));
    expect(bridge.available).toBe(taka(-5_000));
  });

  it("subtracts covered set-aside money only (the documented shortfall example)", () => {
    // One included account; no liabilities, no commitments (docs/domain-model.md §10).
    const at = (balance: number, reserved: number) =>
      availableBridge(
        inputs({
          accounts: [account("bank", "bank", balance)],
          earmarks: backed("bank", taka(balance), [["laptop", taka(reserved)]]),
        }),
      );
    expect(at(100_000, 80_000).available).toBe(taka(20_000));
    // A ৳30,000 expense: reserved 80,000 stays, covered 70,000, short 10,000.
    const afterExpense = at(70_000, 80_000);
    expect(afterExpense.coveredEarmarks).toBe(taka(70_000));
    expect(afterExpense.available).toBe(taka(0));
    // Releasing the unbacked 10,000 releases no backed money.
    expect(at(70_000, 70_000).available).toBe(taka(0));
  });

  it("moves with covered on a transfer between included accounts (the documented example)", () => {
    // Bank and bKash are the only included accounts; no liabilities, no commitments.
    const at = (bank: number, bkash: number) =>
      availableBridge(
        inputs({
          accounts: [account("bank", "bank", bank), account("bkash", "mobile_wallet", bkash)],
          earmarks: backed("bank", taka(bank), [["laptop", taka(80_000)]]),
        }),
      ).available;
    expect(at(100_000, 10_000)).toBe(taka(30_000));
    // ৳50,000 Bank → bKash leaves Laptop short 30,000: Available rises.
    expect(at(50_000, 60_000)).toBe(taka(60_000));
    // ৳20,000 back refills part of the shortfall: Available falls.
    expect(at(70_000, 40_000)).toBe(taka(40_000));
  });

  it("rejects inputs no derivation could produce", () => {
    const bank = account("bank", "bank", 1_000);
    const visa = account("visa", "credit_card", -1_000);
    const earmark = (accountId: string, covered: Money) => ({ itemId: "i", accountId, covered });
    expect(() => availableBridge(inputs({ accounts: [bank, bank] }))).toThrow(RangeError);
    expect(() =>
      availableBridge(inputs({ accounts: [bank], earmarks: [earmark("missing", taka(1))] })),
    ).toThrow(RangeError);
    expect(() =>
      availableBridge(inputs({ accounts: [bank, visa], earmarks: [earmark("visa", taka(1))] })),
    ).toThrow(RangeError);
    expect(() =>
      availableBridge(inputs({ accounts: [bank], earmarks: [earmark("bank", money(-1))] })),
    ).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

interface AccountModel {
  readonly type: AccountType;
  readonly included: boolean;
  readonly balance: Money;
  /** Reserved amounts in backing priority order. */
  readonly reserved: readonly Money[];
}

const amount = fc.integer({ min: 0, max: 5_000_000 }).map(money);
const signedBalance = fc.integer({ min: -2_000_000, max: 5_000_000 }).map(money);

const accountModel = (type: fc.Arbitrary<AccountType>): fc.Arbitrary<AccountModel> =>
  fc.record({
    type,
    included: fc.boolean(),
    balance: signedBalance,
    reserved: fc.array(amount, { maxLength: 3 }),
  });

const anyAccount = accountModel(fc.constantFrom(...ACCOUNT_TYPES));

const occurrenceModel = fc.record({
  dueOffset: fc.integer({ min: -90, max: 90 }),
  amount,
  state: fc.constantFrom<OccurrenceState>("pending", "paid", "skipped"),
});

/** Builds bridge inputs, deriving covered with the real Stage 7 backing. */
function build(
  models: readonly AccountModel[],
  occurrences: readonly { dueOffset: number; amount: Money; state: OccurrenceState }[] = [],
): AvailableInputs {
  return {
    today: TODAY,
    accounts: models.map((m, i) => ({
      accountId: `a${i}`,
      type: m.type,
      includedInAvailable: m.included,
      balance: m.balance,
    })),
    occurrences: occurrences.map((o, i) => ({
      occurrenceId: `o${i}`,
      dueOn: addDays(TODAY, o.dueOffset) as CalendarDate,
      expectedAmount: o.amount,
      state: o.state,
    })),
    earmarks: models.flatMap((m, i) =>
      accountClass(m.type) === "asset"
        ? backed(
            `a${i}`,
            m.balance,
            m.reserved.map((r, k) => [`item${k}`, r] as [string, Money]),
          )
        : [],
    ),
  };
}

describe("availableBridge properties", () => {
  it("the bridge terms always add up to Available", () => {
    fc.assert(
      fc.property(fc.array(anyAccount, { maxLength: 6 }), fc.array(occurrenceModel), (m, o) => {
        const b = availableBridge(build(m, o));
        expect(b.balancesInScope).toBe(add(b.includedAssetBalances, b.liabilityBalances));
        expect(b.afterCommitments).toBe(subtract(b.balancesInScope, b.commitmentsDue));
        expect(b.available).toBe(subtract(b.afterCommitments, b.coveredEarmarks));
        expect(b.commitmentsDue).toBe(sum(b.commitments.map((c) => c.expectedAmount)));
        expect(b.coveredEarmarks).toBe(
          sum(b.earmarks.filter((s) => s.deducted).map((s) => s.covered)),
        );
      }),
    );
  });

  it("every liability balance counts whatever its flag", () => {
    fc.assert(
      fc.property(fc.array(anyAccount, { maxLength: 6 }), (models) => {
        const flipped = models.map((m) =>
          accountClass(m.type) === "liability" ? { ...m, included: !m.included } : m,
        );
        expect(availableBridge(build(flipped)).available).toBe(
          availableBridge(build(models)).available,
        );
      }),
    );
  });

  it("an excluded asset account never moves Available, whatever its balance or set-aside money", () => {
    fc.assert(
      fc.property(
        fc.array(anyAccount, { maxLength: 5 }),
        accountModel(fc.constantFrom<AccountType>("cash", "bank", "mobile_wallet", "savings")),
        accountModel(fc.constantFrom<AccountType>("cash", "bank", "mobile_wallet", "savings")),
        (models, first, second) => {
          const excluded = (x: AccountModel) => [...models, { ...x, included: false }];
          expect(availableBridge(build(excluded(first))).available).toBe(
            availableBridge(build(excluded(second))).available,
          );
        },
      ),
    );
  });

  it("set-aside money keeps each included asset contribution within [min(balance, 0), balance]", () => {
    fc.assert(
      fc.property(fc.array(anyAccount, { maxLength: 6 }), (models) => {
        const b = availableBridge(build(models));
        const assets = b.accounts.filter((a) => a.accountClass === "asset" && a.counted);
        const part = subtract(b.includedAssetBalances, b.coveredEarmarks);
        const floor = sum(assets.map((a) => (a.balance < 0 ? a.balance : money(0))));
        expect(part).toBeGreaterThanOrEqual(floor);
        expect(part).toBeLessThanOrEqual(b.includedAssetBalances);
      }),
    );
  });

  it("a transfer between included asset accounts changes Available by exactly −Δ covered", () => {
    const includedAsset = accountModel(
      fc.constantFrom<AccountType>("cash", "bank", "mobile_wallet", "savings"),
    ).map((m) => ({ ...m, included: true }));
    fc.assert(
      fc.property(
        includedAsset,
        includedAsset,
        fc.array(anyAccount, { maxLength: 4 }),
        amount,
        (source, destination, rest, x) => {
          const before = availableBridge(build([source, destination, ...rest]));
          const after = availableBridge(
            build([
              { ...source, balance: subtract(source.balance, x) },
              { ...destination, balance: add(destination.balance, x) },
              ...rest,
            ]),
          );
          expect(after.balancesInScope).toBe(before.balancesInScope);
          expect(subtract(after.available, before.available)).toBe(
            subtract(before.coveredEarmarks, after.coveredEarmarks),
          );
          const unchangedCover = after.coveredEarmarks === before.coveredEarmarks;
          expect(after.available === before.available).toBe(unchangedCover);
        },
      ),
    );
  });
});
