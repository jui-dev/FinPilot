import { describe, expect, it } from "vitest";

import {
  accountInputSchema,
  fieldForRule,
  signedOpeningBalance,
  toTransactionEntry,
  transactionInputSchema,
} from "@/domain/ledger/input";
import { fromMajor, ZERO } from "@/domain/money";

const base = { accountId: "acc", occurredOn: "2026-09-22" };

describe("transaction input", () => {
  it("parses a typed amount into integer minor units and builds a positive draft", () => {
    const parsed = transactionInputSchema.parse({
      ...base,
      type: "expense",
      amount: "1,500.50",
      categoryId: "cat",
      description: "  Lunch  ",
    });
    const { draft, fee } = toTransactionEntry(parsed);
    expect(draft).toMatchObject({
      type: "expense",
      amount: 150_050,
      accountId: "acc",
      categoryId: "cat",
      occurredOn: "2026-09-22",
      description: "Lunch",
      note: null,
    });
    expect(fee).toBeNull();
  });

  it.each(["", "0", "-5", "abc", "1.234"])("rejects the amount %j", (amount) => {
    const result = transactionInputSchema.safeParse({
      ...base,
      type: "income",
      amount,
      categoryId: "c",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["amount"]);
  });

  it("requires a category for income and expense, and a real date", () => {
    const result = transactionInputSchema.safeParse({
      type: "expense",
      amount: "10",
      accountId: "a",
      categoryId: "",
      occurredOn: "2026-02-30",
    });
    expect(result.error?.issues.map((i) => i.path[0]).sort()).toEqual(["categoryId", "occurredOn"]);
  });

  it("carries a transfer fee only with a category, and rejects same-account transfers", () => {
    const ok = transactionInputSchema.parse({
      ...base,
      type: "transfer",
      amount: "2000",
      counterAccountId: "cash",
      fee: "37",
      feeCategoryId: "fees",
    });
    expect(toTransactionEntry(ok).fee).toEqual({ amount: fromMajor(37), categoryId: "fees" });

    const noCategory = transactionInputSchema.safeParse({
      ...base,
      type: "transfer",
      amount: "2000",
      counterAccountId: "cash",
      fee: "37",
    });
    expect(noCategory.error?.issues[0]?.path).toEqual(["feeCategoryId"]);

    const same = transactionInputSchema.safeParse({
      ...base,
      type: "transfer",
      amount: "1",
      counterAccountId: "acc",
    });
    expect(same.error?.issues[0]?.path).toEqual(["counterAccountId"]);
  });
});

describe("account input", () => {
  it("treats an empty starting amount as zero and signs a card's amount as owed", () => {
    const parsed = accountInputSchema.parse({
      name: " Visa ",
      type: "credit_card",
      openedOn: "2026-08-01",
      startingAmount: "3,200",
    });
    expect(parsed.name).toBe("Visa");
    expect(signedOpeningBalance(parsed.type, parsed.startingAmount)).toBe(fromMajor(-3_200));
    expect(signedOpeningBalance("bank", fromMajor(500))).toBe(fromMajor(500));
    expect(
      accountInputSchema.parse({
        name: "Cash",
        type: "cash",
        openedOn: "2026-08-01",
        startingAmount: "",
      }).startingAmount,
    ).toBe(ZERO);
  });
});

describe("rule rejections map to fields", () => {
  it.each([
    ["before_opened_on", "occurredOn"],
    ["same_account_transfer", "counterAccountId"],
    ["category_kind_mismatch", "categoryId"],
    ["has_active_refunds", null],
  ])("%s → %s", (code, field) => {
    expect(fieldForRule(code)).toBe(field);
  });
});
