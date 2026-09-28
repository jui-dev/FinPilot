import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { fromMajor, money, ZERO, type Money } from "@/domain/money";
import {
  backEarmarks,
  checkEarmarkEntry,
  reservable,
  type EarmarkEntryFacts,
} from "@/domain/protected-money/earmarks";

const t = fromMajor;

const facts = (overrides: Partial<EarmarkEntryFacts> = {}): EarmarkEntryFacts => ({
  item: { archived: false },
  account: { type: "bank", archived: false },
  accountBalance: t(10_000),
  reservedOnAccount: ZERO,
  itemReservedOnAccount: ZERO,
  ...overrides,
});

const code = (amount: Money, overrides?: Partial<EarmarkEntryFacts>) =>
  checkEarmarkEntry(amount, facts(overrides))?.code;

describe("checkEarmarkEntry: write-time invariants", () => {
  it("rejects a zero or non-integer amount", () => {
    expect(code(ZERO)).toBe("invalid_amount");
    expect(code(1.5 as Money)).toBe("invalid_amount");
  });

  it("requires an existing, active item and an existing account", () => {
    expect(code(t(1), { item: undefined })).toBe("item_not_found");
    expect(code(t(1), { item: { archived: true } })).toBe("item_archived");
    expect(code(t(-1), { item: { archived: true } })).toBe("item_archived");
    expect(code(t(1), { account: undefined })).toBe("account_not_found");
  });

  it("allows every asset account type, savings included, and rejects a liability", () => {
    for (const type of ["cash", "bank", "mobile_wallet", "savings"] as const) {
      expect(code(t(1), { account: { type, archived: false } })).toBeUndefined();
    }
    expect(code(t(1), { account: { type: "credit_card", archived: false } })).toBe(
      "account_not_asset",
    );
    expect(code(t(-1), { account: { type: "credit_card", archived: false } })).toBe(
      "account_not_asset",
    );
  });

  it("allows a reservation up to exactly what the account has not yet set aside", () => {
    const other = { reservedOnAccount: t(6_000) };
    expect(code(t(4_000), other)).toBeUndefined();
    expect(code(money(t(4_000) + 1), other)).toBe("exceeds_balance");
  });

  it("counts every item's earmark on the account, so money is never set aside twice", () => {
    expect(
      code(t(1), {
        accountBalance: t(5_000),
        reservedOnAccount: t(5_000),
        itemReservedOnAccount: ZERO,
      }),
    ).toBe("exceeds_balance");
  });

  it("rejects any reservation on an account whose balance is zero or negative", () => {
    expect(code(t(1), { accountBalance: ZERO })).toBe("exceeds_balance");
    expect(code(t(1), { accountBalance: t(-100) })).toBe("exceeds_balance");
  });

  it("allows a partial or full release, never below zero", () => {
    const held = { reservedOnAccount: t(3_000), itemReservedOnAccount: t(3_000) };
    expect(code(t(-1_000), held)).toBeUndefined();
    expect(code(t(-3_000), held)).toBeUndefined();
    expect(code(money(t(-3_000) - 1), held)).toBe("exceeds_reserved");
  });

  it("only releases what this item holds, not other items' earmarks on the account", () => {
    expect(code(t(-2_000), { reservedOnAccount: t(5_000), itemReservedOnAccount: t(1_000) })).toBe(
      "exceeds_reserved",
    );
  });

  it("never checks a release against the balance: a shortfall can always be released", () => {
    expect(
      code(t(-10_000), {
        accountBalance: t(-500),
        reservedOnAccount: t(10_000),
        itemReservedOnAccount: t(10_000),
      }),
    ).toBeUndefined();
  });

  it("takes no new protection on an archived account, whatever its balance", () => {
    const archived = { account: { type: "bank" as const, archived: true } };
    expect(code(t(1), { ...archived, accountBalance: t(10_000) })).toBe("account_archived");
    expect(
      code(t(1), { ...archived, reservedOnAccount: t(1_000), itemReservedOnAccount: t(1_000) }),
    ).toBe("account_archived");
  });

  it("still releases from an archived account, partly or fully", () => {
    const held = {
      account: { type: "bank" as const, archived: true },
      accountBalance: ZERO,
      reservedOnAccount: t(3_000),
      itemReservedOnAccount: t(3_000),
    };
    expect(code(t(-1_000), held)).toBeUndefined();
    expect(code(t(-3_000), held)).toBeUndefined();
  });
});

describe("backEarmarks: oldest first, never more than the balance", () => {
  it("covers everything when the balance is enough", () => {
    expect(
      backEarmarks(t(10_000), [
        { itemId: "a", reserved: t(3_000) },
        { itemId: "b", reserved: t(7_000) },
      ]),
    ).toEqual([
      { itemId: "a", reserved: t(3_000), covered: t(3_000), short: ZERO },
      { itemId: "b", reserved: t(7_000), covered: t(7_000), short: ZERO },
    ]);
  });

  it("puts a shortfall on the newest earmarks first", () => {
    expect(
      backEarmarks(t(5_000), [
        { itemId: "old", reserved: t(3_000) },
        { itemId: "new", reserved: t(4_000) },
        { itemId: "newest", reserved: t(1_000) },
      ]),
    ).toEqual([
      { itemId: "old", reserved: t(3_000), covered: t(3_000), short: ZERO },
      { itemId: "new", reserved: t(4_000), covered: t(2_000), short: t(2_000) },
      { itemId: "newest", reserved: t(1_000), covered: ZERO, short: t(1_000) },
    ]);
  });

  it("covers nothing when the balance is zero or negative", () => {
    expect(backEarmarks(t(-200), [{ itemId: "a", reserved: t(1_000) }])).toEqual([
      { itemId: "a", reserved: t(1_000), covered: ZERO, short: t(1_000) },
    ]);
  });

  it("A-50: Savings 100,000 reserved over a 90,000 balance is 10,000 short", () => {
    expect(backEarmarks(t(90_000), [{ itemId: "laptop", reserved: t(100_000) }])).toEqual([
      { itemId: "laptop", reserved: t(100_000), covered: t(90_000), short: t(10_000) },
    ]);
  });

  it("the established priority, not the item, decides which earmark is short", () => {
    const laptop = { itemId: "laptop", reserved: t(4_000) };
    const fund = { itemId: "fund", reserved: t(4_000) };
    expect(backEarmarks(t(6_000), [laptop, fund]).map((e) => [e.itemId, e.short])).toEqual([
      ["laptop", ZERO],
      ["fund", t(2_000)],
    ]);
    expect(backEarmarks(t(6_000), [fund, laptop]).map((e) => [e.itemId, e.short])).toEqual([
      ["fund", ZERO],
      ["laptop", t(2_000)],
    ]);
  });

  it("never reorders by amount: an earlier earmark that grew keeps its place", () => {
    // "early" was established first and later increased beyond "late".
    const backed = backEarmarks(t(8_500), [
      { itemId: "early", reserved: t(8_000) },
      { itemId: "late", reserved: t(1_000) },
    ]);
    expect(backed).toEqual([
      { itemId: "early", reserved: t(8_000), covered: t(8_000), short: ZERO },
      { itemId: "late", reserved: t(1_000), covered: t(500), short: t(500) },
    ]);
  });

  it("is deterministic for a given priority order and leaves its input untouched", () => {
    const input = [
      { itemId: "b", reserved: t(3_000) },
      { itemId: "a", reserved: t(5_000) },
      { itemId: "c", reserved: t(2_000) },
    ];
    const snapshot = structuredClone(input);
    const first = backEarmarks(t(6_000), input);
    expect(backEarmarks(t(6_000), input)).toEqual(first);
    expect(first.map((e) => e.itemId)).toEqual(["b", "a", "c"]);
    expect(input).toEqual(snapshot);
  });

  it("rejects a negative earmark or the same item twice on one account", () => {
    expect(() => backEarmarks(t(1), [{ itemId: "a", reserved: t(-1) }])).toThrow(RangeError);
    expect(() =>
      backEarmarks(t(1), [
        { itemId: "a", reserved: t(1) },
        { itemId: "a", reserved: t(1) },
      ]),
    ).toThrow(RangeError);
  });

  it("keeps covered within the balance and within each earmark, for any input", () => {
    const amount = fc.integer({ min: 0, max: 10_000_000 }).map(money);
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000_000, max: 10_000_000 }).map(money),
        fc.array(amount, { maxLength: 8 }),
        (balance, reservations) => {
          const backed = backEarmarks(
            balance,
            reservations.map((reserved, i) => ({ itemId: `i${i}`, reserved })),
          );
          const totalCovered = backed.reduce((s, e) => s + e.covered, 0);
          expect(totalCovered).toBeLessThanOrEqual(Math.max(balance, 0));
          for (const e of backed) {
            expect(e.covered).toBeGreaterThanOrEqual(0);
            expect(e.covered).toBeLessThanOrEqual(e.reserved);
            expect(e.covered + e.short).toBe(e.reserved);
          }
          // Oldest first: a later earmark is covered only once every earlier one is fully covered.
          const firstShort = backed.findIndex((e) => e.short > 0);
          if (firstShort >= 0) {
            for (const e of backed.slice(firstShort + 1)) expect(e.covered).toBe(0);
          }
        },
      ),
    );
  });
});

describe("A-51: rejected earmarks on the scenario accounts (Sep 22)", () => {
  it("rejects +1,000 on Savings: 100,000 + 1,000 > balance 90,000", () => {
    expect(
      code(t(1_000), {
        account: { type: "savings", archived: false },
        accountBalance: t(90_000),
        reservedOnAccount: t(100_000),
        itemReservedOnAccount: t(100_000),
      }),
    ).toBe("exceeds_balance");
  });

  it("rejects an earmark on Visa, a liability", () => {
    expect(
      code(t(1_000), {
        account: { type: "credit_card", archived: false },
        accountBalance: t(-6_000),
      }),
    ).toBe("account_not_asset");
  });
});

describe("reservable: what Reserve would accept", () => {
  it("is the balance beyond what is already set aside, never below zero", () => {
    expect(reservable(t(10_000), t(6_000))).toBe(t(4_000));
    expect(reservable(t(10_000), ZERO)).toBe(t(10_000));
    expect(reservable(t(5_000), t(5_000))).toBe(ZERO);
    expect(reservable(t(90_000), t(100_000))).toBe(ZERO);
    expect(reservable(t(-500), ZERO)).toBe(ZERO);
  });

  it("agrees exactly with the Reserve rule at its boundary, for any balance", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }).map(money),
        fc.integer({ min: 0, max: 1_000_000 }).map(money),
        (balance, reserved) => {
          const free = reservable(balance, reserved);
          const verdict = (amount: Money) =>
            code(amount, { accountBalance: balance, reservedOnAccount: reserved });
          if (free > 0) expect(verdict(free)).toBeUndefined();
          expect(verdict(money(free + 1))).toBe("exceeds_balance");
        },
      ),
    );
  });
});
