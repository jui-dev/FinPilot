import { describe, expect, it } from "vitest";

import { calendarDateFromIso } from "@/domain/calendar-date";
import { checkLedgerRules, type LedgerFacts } from "@/domain/ledger/rules";
import type { TransactionDraft } from "@/domain/ledger/transactions";
import { fromMajor, money } from "@/domain/money";

const d = calendarDateFromIso;

const bank = {
  id: "bank",
  type: "bank",
  currency: "BDT",
  openedOn: d("2026-08-01"),
  archived: false,
} as const;
const cash = {
  id: "cash",
  type: "cash",
  currency: "BDT",
  openedOn: d("2026-09-10"),
  archived: false,
} as const;
const shopping = { id: "shopping", kind: "expense", archived: false } as const;
const salary = { id: "salary", kind: "income", archived: false } as const;

const facts: LedgerFacts = {
  today: d("2026-09-22"),
  ownerCurrency: "BDT",
  account: bank,
  category: shopping,
};

const expense: TransactionDraft = {
  type: "expense",
  amount: fromMajor(100),
  accountId: "bank",
  categoryId: "shopping",
  occurredOn: d("2026-09-15"),
};

const code = (draft: TransactionDraft, f: LedgerFacts = facts) =>
  checkLedgerRules(draft, f)?.code ?? null;

describe("checkLedgerRules", () => {
  it("accepts a valid expense", () => {
    expect(code(expense)).toBeNull();
  });

  it.each<[string, TransactionDraft, LedgerFacts, string]>([
    ["zero amount", { ...expense, amount: money(0) }, facts, "invalid_amount"],
    ["negative amount", { ...expense, amount: money(-5) }, facts, "invalid_amount"],
    ["a future date", { ...expense, occurredOn: d("2026-09-23") }, facts, "future_date"],
    ["a missing account", expense, { ...facts, account: undefined }, "account_not_found"],
    [
      "an archived account",
      expense,
      { ...facts, account: { ...bank, archived: true } },
      "account_archived",
    ],
    [
      "a foreign-currency account",
      expense,
      { ...facts, account: { ...bank, currency: "USD" } },
      "currency_mismatch",
    ],
    [
      "a date before opened_on",
      { ...expense, occurredOn: d("2026-07-31") },
      facts,
      "before_opened_on",
    ],
    ["a missing category", expense, { ...facts, category: undefined }, "category_not_found"],
    [
      "an archived category",
      expense,
      { ...facts, category: { ...shopping, archived: true } },
      "category_archived",
    ],
    [
      "an income category on an expense",
      { ...expense, categoryId: "salary" },
      { ...facts, category: salary },
      "category_kind_mismatch",
    ],
  ])("rejects %s", (_label, draft, f, expected) => {
    expect(code(draft, f)).toBe(expected);
  });

  it("accepts today's date and the opening date itself", () => {
    expect(code({ ...expense, occurredOn: d("2026-09-22") })).toBeNull();
    expect(code({ ...expense, occurredOn: d("2026-08-01") })).toBeNull();
  });

  describe("transfers", () => {
    const transfer: TransactionDraft = {
      type: "transfer",
      amount: fromMajor(100),
      accountId: "bank",
      counterAccountId: "cash",
      occurredOn: d("2026-09-15"),
    };
    const tf: LedgerFacts = { ...facts, category: undefined, counterAccount: cash };

    it("accepts a valid transfer (no category needed)", () => {
      expect(code(transfer, tf)).toBeNull();
    });
    it("rejects a transfer to the same account", () => {
      expect(code({ ...transfer, counterAccountId: "bank" }, tf)).toBe("same_account_transfer");
    });
    it("checks the destination's opened_on too", () => {
      expect(code({ ...transfer, occurredOn: d("2026-09-05") }, tf)).toBe("before_opened_on");
    });
    it("rejects a missing or archived destination", () => {
      expect(code(transfer, { ...tf, counterAccount: undefined })).toBe(
        "counter_account_not_found",
      );
      expect(code(transfer, { ...tf, counterAccount: { ...cash, archived: true } })).toBe(
        "counter_account_archived",
      );
    });
  });

  describe("refunds (D6)", () => {
    const refund: TransactionDraft = {
      type: "refund",
      amount: fromMajor(1_200),
      accountId: "bank",
      refundOfId: "jacket",
      occurredOn: d("2026-09-16"),
    };
    const target = { id: "jacket", type: "expense", categoryId: "shopping" };

    it("a linked refund inherits the expense's category", () => {
      expect(code(refund, { ...facts, refundTarget: target })).toBeNull();
    });
    it("a linked refund may repeat the same category explicitly", () => {
      expect(
        code({ ...refund, categoryId: "shopping" }, { ...facts, refundTarget: target }),
      ).toBeNull();
    });
    it("a linked refund cannot use a different category", () => {
      expect(code({ ...refund, categoryId: "groceries" }, { ...facts, refundTarget: target })).toBe(
        "refund_category_mismatch",
      );
    });
    it("the target must be an active expense", () => {
      expect(code(refund, { ...facts, refundTarget: undefined })).toBe("refund_target_invalid");
      expect(code(refund, { ...facts, refundTarget: { ...target, type: "income" } })).toBe(
        "refund_target_invalid",
      );
    });
    it("a standalone refund chooses its expense category normally", () => {
      const standalone: TransactionDraft = { ...refund, refundOfId: null, categoryId: "shopping" };
      expect(code(standalone)).toBeNull();
      expect(code({ ...standalone, categoryId: "salary" }, { ...facts, category: salary })).toBe(
        "category_kind_mismatch",
      );
    });
  });

  describe("opening balances", () => {
    const opening: TransactionDraft = {
      type: "opening_balance",
      balance: fromMajor(-12_000),
      accountId: "bank",
      occurredOn: d("2026-08-01"),
    };
    it("accepts a signed (negative) balance on the opening date", () => {
      expect(code(opening, { ...facts, category: undefined })).toBeNull();
    });
    it("must be dated opened_on and must not be zero", () => {
      expect(code({ ...opening, occurredOn: d("2026-08-02") })).toBe("opening_balance_date");
      expect(code({ ...opening, balance: money(0) })).toBe("invalid_amount");
    });
  });

  describe("adjustments", () => {
    // Reconciliation posts a signed correction, so unlike every other recorded
    // type a negative amount is valid and only zero is meaningless.
    const adjustment: TransactionDraft = {
      type: "adjustment",
      difference: fromMajor(-350),
      accountId: "bank",
      occurredOn: d("2026-09-20"),
    };
    const noCategory: LedgerFacts = { ...facts, category: undefined };

    it("accepts a negative correction", () => {
      expect(code(adjustment, noCategory)).toBeNull();
    });

    it("accepts a positive correction", () => {
      expect(code({ ...adjustment, difference: fromMajor(350) }, noCategory)).toBeNull();
    });

    it("rejects a zero correction", () => {
      expect(code({ ...adjustment, difference: money(0) }, noCategory)).toBe("invalid_amount");
    });

    it("obeys the same date and account rules as everything else", () => {
      expect(code({ ...adjustment, occurredOn: d("2026-09-23") }, noCategory)).toBe("future_date");
      expect(code({ ...adjustment, occurredOn: d("2026-07-31") }, noCategory)).toBe(
        "before_opened_on",
      );
      expect(code(adjustment, { ...noCategory, account: { ...bank, archived: true } })).toBe(
        "account_archived",
      );
      expect(code(adjustment, { ...noCategory, account: undefined })).toBe("account_not_found");
    });
  });
});
