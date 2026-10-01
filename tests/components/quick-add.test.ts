import { describe, expect, it } from "vitest";

import { previewEffects, type PreviewInput } from "@/components/quick-add/preview";
import { recentCategories, type QuickAddData } from "@/components/quick-add/quick-add";
import { calendarDateFromIso } from "@/domain/calendar-date";
import { fromMajor, money } from "@/domain/money";

const accounts = [
  { id: "bank", name: "Bank", type: "bank" as const, balance: fromMajor(42_300) },
  { id: "bkash", name: "bKash", type: "mobile_wallet" as const, balance: fromMajor(8_400) },
];
const input: PreviewInput = {
  type: "expense",
  amount: "450",
  accountId: "bkash",
  counterAccountId: "",
  categoryId: "groceries",
  occurredOn: calendarDateFromIso("2026-10-01"),
  fee: null,
  feeCategoryId: "",
};

describe("previewEffects: shown only when it is real", () => {
  it("previews the account the entry touches", () => {
    expect(previewEffects(input, accounts)).toEqual([
      {
        accountId: "bkash",
        name: "bKash",
        type: "mobile_wallet",
        before: fromMajor(8_400),
        after: fromMajor(7_950),
      },
    ]);
  });

  it("previews nothing without a positive amount", () => {
    for (const amount of ["", "0", "abc", "-5"]) {
      expect(previewEffects({ ...input, amount }, accounts)).toBeNull();
    }
  });

  it("previews nothing without the accounts it needs", () => {
    expect(previewEffects({ ...input, accountId: "" }, accounts)).toBeNull();
    const transfer = { ...input, type: "transfer" as const, accountId: "bank" };
    expect(previewEffects({ ...transfer, counterAccountId: "" }, accounts)).toBeNull();
    expect(previewEffects({ ...transfer, counterAccountId: "bank" }, accounts)).toBeNull();
  });

  it("takes a transfer's fee from the From account, and shows nothing for an unreadable fee", () => {
    const transfer = {
      ...input,
      type: "transfer" as const,
      amount: "5,000",
      accountId: "bank",
      counterAccountId: "bkash",
    };
    expect(previewEffects({ ...transfer, fee: "18.50" }, accounts)?.map((e) => e.after)).toEqual([
      money(3_728_150),
      fromMajor(13_400),
    ]);
    expect(previewEffects({ ...transfer, fee: "" }, accounts)?.[0]?.after).toBe(fromMajor(37_300));
    expect(previewEffects({ ...transfer, fee: "x" }, accounts)).toBeNull();
  });
});

describe("recentCategories", () => {
  const data = (defaults: Partial<QuickAddData["defaults"]>): QuickAddData => ({
    accounts: [],
    categories: ["a", "b", "c", "d", "e", "x"].map((id) => ({
      id,
      name: id.toUpperCase(),
      kind: id === "x" ? ("income" as const) : ("expense" as const),
    })),
    defaults: {
      expense: null,
      income: null,
      transfer: null,
      frequentCategoryIds: { expense: [], income: [] },
      feeCategoryId: null,
      ...defaults,
    },
    today: calendarDateFromIso("2026-10-01"),
  });

  it("puts the last used first, then the most used, without repeats, at most three", () => {
    const recent = recentCategories(
      data({
        expense: { accountId: "bank", categoryId: "c" },
        frequentCategoryIds: { expense: ["a", "c", "d", "e"], income: [] },
      }),
      "expense",
    );
    expect(recent.map((c) => c.id)).toEqual(["c", "a", "d"]);
  });

  it("offers only active categories of the kind", () => {
    const recent = recentCategories(
      data({
        expense: { accountId: "bank", categoryId: "archived" },
        frequentCategoryIds: { expense: ["x", "gone", "b"], income: [] },
      }),
      "expense",
    );
    expect(recent.map((c) => c.id)).toEqual(["b"]);
  });

  it("is empty when nothing has been recorded yet", () => {
    expect(recentCategories(data({}), "income")).toEqual([]);
  });
});
