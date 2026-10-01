import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import { DEFAULT_CATEGORIES } from "@/domain/ledger/categories";
import { getEntryDefaults } from "@/server/services/activity-service";
import { createCommitment } from "@/server/services/commitment-service";
import {
  deleteTransaction,
  getTransactions,
  recordTransaction,
  recordTransferWithFee,
  updateTransaction,
} from "@/server/services/ledger-service";
import {
  archiveCategory,
  createCategory,
  deleteCategory,
  getCategories,
  getCategoryReferenceCounts,
  getCategoryUsage,
  renameCategory,
  restoreCategory,
} from "@/server/services/setup-service";

import { d, errorCode, ok, setupLedger, taka } from "../support/ledger";

let handle: DatabaseHandle | undefined;
afterEach(() => handle?.close());

async function ledger() {
  const setup = await setupLedger();
  handle = setup.handle;
  const bank = await setup.account("Bank", "bank", "2026-08-01", 85_000);
  const spend = (categoryId: string, amount = 500, occurredOn = "2026-09-10") =>
    recordTransaction(setup.ctx, {
      type: "expense",
      amount: taka(amount),
      accountId: bank,
      categoryId,
      occurredOn: d(occurredOn),
    });
  return { ...setup, bank, spend };
}

describe("archived categories keep the records that already use them", () => {
  it("edits a transaction whose category was archived after it was recorded", async () => {
    const { ctx, bank, category, spend } = await ledger();
    const id = ok(await spend(category("Groceries")));
    ok(await archiveCategory(ctx, category("Groceries")));

    ok(
      await updateTransaction(ctx, id, {
        type: "expense",
        amount: taka(650),
        accountId: bank,
        categoryId: category("Groceries"),
        occurredOn: d("2026-09-10"),
      }),
    );
    const row = (await getTransactions(ctx)).find((t) => t.id === id);
    expect(row).toMatchObject({ id, amountMinor: -65_000, categoryId: category("Groceries") });
  });

  it("does not let an edit move a transaction into another archived category", async () => {
    const { ctx, bank, category, spend } = await ledger();
    const id = ok(await spend(category("Groceries")));
    ok(await archiveCategory(ctx, category("Shopping")));

    const moved = await updateTransaction(ctx, id, {
      type: "expense",
      amount: taka(500),
      accountId: bank,
      categoryId: category("Shopping"),
      occurredOn: d("2026-09-10"),
    });
    expect(errorCode(moved)).toBe("category_archived");
  });

  it("refunds an expense whose category was archived, into that category", async () => {
    const { ctx, bank, category, spend } = await ledger();
    const id = ok(await spend(category("Shopping"), 2_000));
    ok(await archiveCategory(ctx, category("Shopping")));

    const refund = ok(
      await recordTransaction(ctx, {
        type: "refund",
        amount: taka(800),
        accountId: bank,
        refundOfId: id,
        occurredOn: d("2026-09-12"),
      }),
    );
    const row = (await getTransactions(ctx)).find((t) => t.id === refund)!;
    expect(row.categoryId).toBe(category("Shopping"));
  });

  it("still refuses an archived category for a new transaction", async () => {
    const { ctx, category, spend } = await ledger();
    ok(await archiveCategory(ctx, category("Groceries")));
    expect(errorCode(await spend(category("Groceries")))).toBe("category_archived");
  });
});

describe("the last active category of a kind", () => {
  it("cannot be archived, for either kind", async () => {
    const { ctx, category } = await ledger();
    ok(await archiveCategory(ctx, category("Other Income")));
    const last = await archiveCategory(ctx, category("Salary"));
    expect(errorCode(last)).toBe("last_active_category");
    expect(last.ok ? "" : last.error.message).toBe(
      "Keep at least one Income Category active so new income can be recorded.",
    );

    const expenses = DEFAULT_CATEGORIES.filter((c) => c.kind === "expense").map((c) => c.name);
    for (const name of expenses.slice(1)) ok(await archiveCategory(ctx, category(name)));
    const lastExpense = await archiveCategory(ctx, category(expenses[0]!));
    expect(lastExpense.ok ? "" : lastExpense.error.message).toBe(
      "Keep at least one Expense Category active so new expenses can be recorded.",
    );
  });

  it("cannot be deleted, even unused", async () => {
    const { ctx, category } = await ledger();
    ok(await archiveCategory(ctx, category("Salary")));
    expect(errorCode(await deleteCategory(ctx, category("Other Income")))).toBe(
      "last_active_category",
    );
  });

  it("can be archived once another of its kind is restored or created", async () => {
    const { ctx, category } = await ledger();
    ok(await archiveCategory(ctx, category("Other Income")));
    ok(await restoreCategory(ctx, category("Other Income")));
    ok(await archiveCategory(ctx, category("Salary")));
    const bonus = ok(await createCategory(ctx, { name: "Bonus", kind: "income" }));
    ok(await archiveCategory(ctx, category("Other Income")));
    expect(errorCode(await archiveCategory(ctx, bonus))).toBe("last_active_category");
  });

  it("does not stop an archived category being deleted", async () => {
    const { ctx } = await ledger();
    const pets = ok(await createCategory(ctx, { name: "Pets", kind: "expense" }));
    ok(await archiveCategory(ctx, pets));
    ok(await deleteCategory(ctx, pets));
    expect((await getCategories(ctx)).map((c) => c.name)).not.toContain("Pets");
  });
});

describe("names", () => {
  it("are unique per kind, and an archived match says to restore it", async () => {
    const { ctx, category } = await ledger();
    const taken = await createCategory(ctx, { name: "groceries", kind: "expense" });
    expect(taken.ok ? "" : taken.error.message).toBe(
      "There is already an Expense Category called Groceries.",
    );

    ok(await archiveCategory(ctx, category("Groceries")));
    const archived = await createCategory(ctx, { name: "Groceries ", kind: "expense" });
    expect(archived.ok ? "" : archived.error.message).toBe(
      "Groceries is an archived Expense Category. Restore it instead.",
    );
    expect(errorCode(await renameCategory(ctx, category("Shopping"), "GROCERIES"))).toBe(
      "duplicate_name",
    );
  });

  it("may repeat across kinds, and a rename may change only the case", async () => {
    const { ctx, category } = await ledger();
    ok(await createCategory(ctx, { name: "Housing", kind: "income" }));
    ok(await renameCategory(ctx, category("Groceries"), "GROCERIES"));
  });

  it("can be changed on a used category; its records keep their category", async () => {
    const { ctx, category, spend } = await ledger();
    const id = ok(await spend(category("Groceries")));
    ok(await renameCategory(ctx, category("Groceries"), "Food shopping"));
    const row = (await getTransactions(ctx)).find((t) => t.id === id)!;
    const renamed = (await getCategories(ctx)).find((c) => c.id === row.categoryId)!;
    expect(renamed).toMatchObject({ name: "Food shopping", kind: "expense" });
  });
});

describe("usage", () => {
  it("counts recorded transactions and names commitments; deleting counts every reference", async () => {
    const { ctx, bank, category, spend } = await ledger();
    const housing = category("Housing");
    ok(await spend(housing));
    const removed = ok(await spend(housing, 200));
    ok(await deleteTransaction(ctx, removed));
    ok(
      await createCommitment(ctx, {
        name: "Rent",
        categoryId: housing,
        expectedAmount: taka(30_000),
        expectedAccountId: bank,
        frequency: "monthly",
        interval: 1,
        anchorOn: d("2026-10-01"),
        endOn: null,
      }),
    );

    const usage = await getCategoryUsage(ctx);
    expect(usage.get(housing)).toEqual({ records: 1, commitments: ["Rent"] });
    expect(usage.get(category("Health"))).toBeUndefined();
    expect((await getCategoryReferenceCounts(ctx)).get(housing)).toBe(3);
    expect(errorCode(await deleteCategory(ctx, housing))).toBe("category_in_use");
  });

  it("lets a category used only by a deleted transaction be archived but not deleted", async () => {
    const { ctx, category, spend } = await ledger();
    const id = ok(await spend(category("Transport")));
    ok(await deleteTransaction(ctx, id));
    expect((await getCategoryUsage(ctx)).get(category("Transport"))).toBeUndefined();
    expect(errorCode(await deleteCategory(ctx, category("Transport")))).toBe("category_in_use");
    ok(await archiveCategory(ctx, category("Transport")));
  });
});

describe("transfer fees", () => {
  it("go to any active expense category, whatever Fees & Charges is called", async () => {
    const { ctx, bank, account, category } = await ledger();
    const wallet = await account("Wallet", "mobile_wallet", "2026-08-01", 2_000);
    expect((await getEntryDefaults(ctx)).feeCategoryId).toBeNull();

    ok(await renameCategory(ctx, category("Fees & Charges"), "Bank charges"));
    const transfer = (feeCategoryId: string) =>
      recordTransferWithFee(ctx, {
        fromAccountId: wallet,
        toAccountId: bank,
        amount: taka(500),
        fee: taka(9),
        feeCategoryId,
        occurredOn: d("2026-09-10"),
      });
    ok(await transfer(category("Fees & Charges")));
    expect((await getEntryDefaults(ctx)).feeCategoryId).toBe(category("Fees & Charges"));

    ok(await transfer(category("Other")));
    expect((await getEntryDefaults(ctx)).feeCategoryId).toBe(category("Other"));

    // A plain expense is not a fee: the last fee's category stays the default.
    ok(
      await recordTransaction(ctx, {
        type: "expense",
        amount: taka(50),
        accountId: wallet,
        categoryId: category("Transport"),
        occurredOn: d("2026-09-11"),
      }),
    );
    expect((await getEntryDefaults(ctx)).feeCategoryId).toBe(category("Other"));
  });

  it("cannot be newly recorded in an archived category", async () => {
    const { ctx, bank, account, category } = await ledger();
    const wallet = await account("Wallet", "mobile_wallet", "2026-08-01", 2_000);
    ok(await archiveCategory(ctx, category("Fees & Charges")));
    const result = await recordTransferWithFee(ctx, {
      fromAccountId: wallet,
      toAccountId: bank,
      amount: taka(500),
      fee: taka(9),
      feeCategoryId: category("Fees & Charges"),
      occurredOn: d("2026-09-10"),
    });
    expect(errorCode(result)).toBe("category_archived");
  });
});
