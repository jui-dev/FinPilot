import { describe, expect, it } from "vitest";

import { calendarDateFromIso } from "@/domain/calendar-date";
import {
  ACCOUNT_TYPES,
  accountClass,
  checkAvailableEligibility,
  defaultIncludedInAvailable,
} from "@/domain/ledger/accounts";
import { formatPercent, savingsRate } from "@/domain/ledger/analytics";
import { compareLedgerOrder } from "@/domain/ledger/ordering";
import { liabilityStanding, summarizePosition } from "@/domain/ledger/position";
import {
  balanceDeltas,
  countsAsIncome,
  countsAsSpending,
  requiredCategoryKind,
  shapeViolations,
  toLedgerRow,
  type LedgerRow,
} from "@/domain/ledger/transactions";
import { fromMajor, money } from "@/domain/money";

const d = calendarDateFromIso;
const on = d("2026-09-22");

const base: LedgerRow = {
  type: "expense",
  amountMinor: money(-100),
  accountId: "a",
  counterAccountId: null,
  categoryId: "c",
  refundOfId: null,
};

describe("accounts", () => {
  it("derives class from type; only credit cards are liabilities", () => {
    expect(accountClass("credit_card")).toBe("liability");
    for (const t of ["cash", "bank", "mobile_wallet", "savings"] as const) {
      expect(accountClass(t)).toBe("asset");
    }
  });

  it("defaults Available eligibility: savings off, everything else on", () => {
    expect(defaultIncludedInAvailable("savings")).toBe(false);
    expect(defaultIncludedInAvailable("credit_card")).toBe(true);
    expect(defaultIncludedInAvailable("mobile_wallet")).toBe(true);
  });

  it("rejects an excluded liability; an asset may be included or excluded", () => {
    expect(checkAvailableEligibility("credit_card", false)).toMatchObject({
      code: "liability_excluded",
    });
    expect(checkAvailableEligibility("credit_card", true)).toBeUndefined();
    for (const t of ["cash", "bank", "mobile_wallet", "savings"] as const) {
      expect(checkAvailableEligibility(t, true)).toBeUndefined();
      expect(checkAvailableEligibility(t, false)).toBeUndefined();
    }
  });

  it("every type's default eligibility satisfies the liability invariant", () => {
    for (const t of ACCOUNT_TYPES) {
      expect(checkAvailableEligibility(t, defaultIncludedInAvailable(t))).toBeUndefined();
    }
  });
});

describe("transaction types", () => {
  it("only income counts as income; only expense and refund count as spending", () => {
    expect(countsAsIncome("income")).toBe(true);
    expect(countsAsIncome("refund")).toBe(false);
    expect(countsAsSpending("expense")).toBe(true);
    expect(countsAsSpending("refund")).toBe(true);
    for (const t of ["transfer", "opening_balance", "adjustment"] as const) {
      expect(countsAsIncome(t) || countsAsSpending(t)).toBe(false);
    }
  });

  it("requires the right category kind", () => {
    expect(requiredCategoryKind("income")).toBe("income");
    expect(requiredCategoryKind("refund")).toBe("expense");
    expect(requiredCategoryKind("transfer")).toBeNull();
  });
});

describe("toLedgerRow: positive amounts in, signed effect on the account out", () => {
  it("negates expenses and transfers, keeps income and refunds positive", () => {
    const amount = fromMajor(500);
    expect(
      toLedgerRow({ type: "expense", amount, accountId: "a", categoryId: "c", occurredOn: on })
        .amountMinor,
    ).toBe(-50_000);
    expect(
      toLedgerRow({ type: "income", amount, accountId: "a", categoryId: "c", occurredOn: on })
        .amountMinor,
    ).toBe(50_000);
    expect(
      toLedgerRow({ type: "refund", amount, accountId: "a", categoryId: "c", occurredOn: on })
        .amountMinor,
    ).toBe(50_000);
    const transfer = toLedgerRow({
      type: "transfer",
      amount,
      accountId: "a",
      counterAccountId: "b",
      occurredOn: on,
    });
    expect(transfer).toMatchObject({
      amountMinor: -50_000,
      counterAccountId: "b",
      categoryId: null,
    });
  });

  it("keeps an opening balance's sign (negative = owed on a card)", () => {
    const row = toLedgerRow({
      type: "opening_balance",
      balance: fromMajor(-12_000),
      accountId: "v",
      occurredOn: on,
    });
    expect(row).toMatchObject({
      type: "opening_balance",
      amountMinor: -1_200_000,
      categoryId: null,
    });
  });

  it("gives a linked refund the resolved category", () => {
    const row = toLedgerRow(
      { type: "refund", amount: fromMajor(1), accountId: "a", refundOfId: "x", occurredOn: on },
      "shopping",
    );
    expect(row).toMatchObject({ categoryId: "shopping", refundOfId: "x" });
  });
});

describe("balanceDeltas: the row's effect on each account", () => {
  const amount = fromMajor(500);

  it("moves one account for income and expenses, by the signed amount", () => {
    expect(
      balanceDeltas(
        toLedgerRow({ type: "expense", amount, accountId: "a", categoryId: "c", occurredOn: on }),
      ),
    ).toEqual([{ accountId: "a", delta: -50_000 }]);
    expect(
      balanceDeltas(
        toLedgerRow({ type: "income", amount, accountId: "a", categoryId: "c", occurredOn: on }),
      ),
    ).toEqual([{ accountId: "a", delta: 50_000 }]);
  });

  it("takes a transfer out of From and puts the same amount into To", () => {
    const row = toLedgerRow({
      type: "transfer",
      amount,
      accountId: "a",
      counterAccountId: "b",
      occurredOn: on,
    });
    expect(balanceDeltas(row)).toEqual([
      { accountId: "a", delta: -50_000 },
      { accountId: "b", delta: 50_000 },
    ]);
  });
});

describe("shapeViolations (mirror of the database CHECKs)", () => {
  it("accepts well-formed rows of every type", () => {
    expect(shapeViolations(base)).toEqual([]);
    expect(shapeViolations({ ...base, type: "income", amountMinor: money(1) })).toEqual([]);
    expect(
      shapeViolations({ ...base, type: "refund", amountMinor: money(1), refundOfId: "x" }),
    ).toEqual([]);
    expect(
      shapeViolations({ ...base, type: "transfer", categoryId: null, counterAccountId: "b" }),
    ).toEqual([]);
    expect(
      shapeViolations({
        ...base,
        type: "adjustment",
        amountMinor: money(-35_000),
        categoryId: null,
      }),
    ).toEqual([]);
  });

  it.each<[string, Partial<LedgerRow>, string]>([
    ["expense with positive amount", { amountMinor: money(100) }, "expense"],
    ["expense without category", { categoryId: null }, "expense"],
    ["income with negative amount", { type: "income" }, "income"],
    [
      "transfer to itself",
      { type: "transfer", categoryId: null, counterAccountId: "a" },
      "transfer",
    ],
    ["transfer with a category", { type: "transfer", counterAccountId: "b" }, "transfer"],
    [
      "refund with counter account",
      { type: "refund", amountMinor: money(1), counterAccountId: "b" },
      "refund",
    ],
    [
      "zero opening balance",
      { type: "opening_balance", amountMinor: money(0), categoryId: null },
      "opening_adjustment",
    ],
    [
      "adjustment with category",
      { type: "adjustment", amountMinor: money(1) },
      "opening_adjustment",
    ],
  ])("rejects %s", (_label, patch, expected) => {
    expect(shapeViolations({ ...base, ...patch })).toContain(expected);
  });
});

describe("business ordering", () => {
  it("orders by date, then by recording sequence — never by id", () => {
    const rows = [
      { id: "zzz", occurredOn: d("2026-09-02"), sequence: 1 },
      { id: "aaa", occurredOn: d("2026-09-01"), sequence: 9 },
      { id: "mmm", occurredOn: d("2026-09-02"), sequence: 3 },
    ];
    expect([...rows].sort(compareLedgerOrder).map((r) => r.id)).toEqual(["aaa", "zzz", "mmm"]);
    expect(compareLedgerOrder(rows[0]!, rows[0]!)).toBe(0);
  });
});

describe("position", () => {
  it("net worth is Σ balances; liabilities are grouped by class and shown as owed", () => {
    const position = summarizePosition([
      { accountId: "bank", type: "bank", balance: fromMajor(133_000) },
      { accountId: "visa", type: "credit_card", balance: fromMajor(-6_000) },
    ]);
    expect(position).toEqual({
      netWorth: fromMajor(127_000),
      assets: fromMajor(133_000),
      liabilities: fromMajor(6_000),
      liabilityStanding: { kind: "owed", amount: fromMajor(6_000) },
    });
  });

  it("an overpaid card is a negative liability, not an asset, and reads as credit", () => {
    const position = summarizePosition([
      { accountId: "visa", type: "credit_card", balance: fromMajor(500) },
    ]);
    expect(position).toEqual({
      netWorth: fromMajor(500),
      assets: 0,
      liabilities: fromMajor(-500),
      liabilityStanding: { kind: "credit", amount: fromMajor(500) },
    });
  });

  it("reads the net of all cards: owed on one, credit on another", () => {
    const card = (accountId: string, major: number) =>
      ({ accountId, type: "credit_card", balance: fromMajor(major) }) as const;
    expect(summarizePosition([card("a", -6_000), card("b", 500)]).liabilityStanding).toEqual({
      kind: "owed",
      amount: fromMajor(5_500),
    });
    expect(summarizePosition([card("a", -500), card("b", 2_000)]).liabilityStanding).toEqual({
      kind: "credit",
      amount: fromMajor(1_500),
    });
    expect(summarizePosition([card("a", -500), card("b", 500)]).liabilityStanding).toEqual({
      kind: "clear",
      amount: 0,
    });
    expect(summarizePosition([]).liabilityStanding).toEqual({ kind: "clear", amount: 0 });
  });

  it("classifies a liability balance, signed as stored", () => {
    expect(liabilityStanding(fromMajor(-3_200))).toEqual({
      kind: "owed",
      amount: fromMajor(3_200),
    });
    expect(liabilityStanding(fromMajor(250))).toEqual({ kind: "credit", amount: fromMajor(250) });
    expect(liabilityStanding(money(0))).toEqual({ kind: "clear", amount: 0 });
    // The magnitude is exact to the paisa.
    expect(liabilityStanding(money(-1))).toEqual({ kind: "owed", amount: money(1) });
  });
});

describe("savings rate", () => {
  it("is exact until presentation: 28,513 / 95,000 → 30.0%", () => {
    const rate = savingsRate(fromMajor(95_000), fromMajor(66_487));
    expect(rate).toEqual({ numerator: fromMajor(28_513), denominator: fromMajor(95_000) });
    expect(formatPercent(rate!)).toBe("30.0%");
  });

  it("is undefined without income, and can be negative", () => {
    expect(savingsRate(fromMajor(0), fromMajor(10))).toBeNull();
    expect(formatPercent(savingsRate(fromMajor(100), fromMajor(150))!)).toBe("−50.0%");
  });

  it("rounds half away from zero at presentation", () => {
    expect(formatPercent({ numerator: 1, denominator: 8 }, 1)).toBe("12.5%");
    expect(formatPercent({ numerator: 1, denominator: 16 }, 1)).toBe("6.3%");
    expect(formatPercent({ numerator: -1, denominator: 16 }, 1)).toBe("−6.3%");
    expect(formatPercent({ numerator: 2, denominator: 3 }, 0)).toBe("67%");
  });
});
