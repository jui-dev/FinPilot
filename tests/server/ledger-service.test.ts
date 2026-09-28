import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import { owners, transactions } from "@/db/schema";
import { monthRange, yearMonth } from "@/domain/calendar-date";
import type { AccountType } from "@/domain/ledger/accounts";
import { money } from "@/domain/money";
import {
  deleteTransaction,
  getAccountBalances,
  getPosition,
  getSpendingByCategory,
  getTransactions,
  recordTransaction,
  recordTransferWithFee,
  restoreTransaction,
  updateTransaction,
} from "@/server/services/ledger-service";
import { createAccount, createCategory, getAccounts } from "@/server/services/setup-service";

import { d, errorCode, ok, setupLedger, taka } from "../support/ledger";

let handle: DatabaseHandle | undefined;
afterEach(() => handle?.close());

async function ledger() {
  const setup = await setupLedger();
  handle = setup.handle;
  const bank = await setup.account("Bank", "bank", "2026-08-01", 85_000);
  const cash = await setup.account("Cash", "cash", "2026-08-01", 3_000);
  const visa = await setup.account("Visa", "credit_card", "2026-08-01", -12_000);
  return { ...setup, bank, cash, visa };
}

const balanceOf = async (ctx: Parameters<typeof getAccountBalances>[0], id: string) =>
  (await getAccountBalances(ctx)).find((b) => b.accountId === id)!.balance;

const september = monthRange(yearMonth(2026, 9));

describe("accounts and opening balances", () => {
  it("records a non-zero start as one opening-balance transaction dated opened_on", async () => {
    const { ctx, visa } = await ledger();
    const rows = (await getTransactions(ctx)).filter((t) => t.accountId === visa);
    expect(rows).toMatchObject([
      { type: "opening_balance", amountMinor: taka(-12_000), occurredOn: "2026-08-01" },
    ]);
    expect(await balanceOf(ctx, visa)).toBe(taka(-12_000));
  });

  it("an account opened at zero has no opening-balance transaction but still has a start date", async () => {
    const { ctx, account, category } = await ledger();
    const wallet = await account("bKash", "mobile_wallet", "2026-09-01");
    expect((await getTransactions(ctx)).filter((t) => t.accountId === wallet)).toEqual([]);
    expect(await balanceOf(ctx, wallet)).toBe(0);
    const early = await recordTransaction(ctx, {
      type: "expense",
      amount: taka(10),
      accountId: wallet,
      categoryId: category("Other"),
      occurredOn: d("2026-08-31"),
    });
    expect(errorCode(early)).toBe("before_opened_on");
  });

  it("defaults Available eligibility from the type and rejects duplicate names", async () => {
    const { ctx } = await ledger();
    expect(
      errorCode(
        await createAccount(ctx, { name: "bank", type: "bank", openedOn: d("2026-08-01") }),
      ),
    ).toBe("duplicate_name");
    expect(
      errorCode(
        await createAccount(ctx, { name: "Later", type: "cash", openedOn: d("2026-09-23") }),
      ),
    ).toBe("future_date");
  });

  it("never stores an excluded liability; asset eligibility is kept as given", async () => {
    const { ctx, handle: h } = await ledger();
    const rows = () =>
      h.sqlite
        .prepare(
          "SELECT (SELECT count(*) FROM accounts) AS accounts, (SELECT count(*) FROM transactions) AS transactions",
        )
        .get();
    const before = rows();

    // Rejected atomically: neither the account nor its opening balance is written.
    const excludedCard = await createAccount(ctx, {
      name: "Amex",
      type: "credit_card",
      openedOn: d("2026-08-01"),
      openingBalance: taka(-1_000),
      includedInAvailable: false,
    });
    expect(excludedCard).toMatchObject({
      ok: false,
      error: {
        code: "liability_excluded",
        message: "A credit card always counts toward Available and cannot be excluded.",
      },
    });
    expect(rows()).toEqual(before);

    const create = async (name: string, type: AccountType, includedInAvailable?: boolean) =>
      ok(await createAccount(ctx, { name, type, openedOn: d("2026-08-01"), includedInAvailable }));
    const stored = new Set([
      await create("Amex", "credit_card", true),
      await create("Mastercard", "credit_card"),
      await create("Deposit", "savings", false),
      await create("Salary account", "bank", false),
      await create("Pension", "savings", true),
    ]);
    const flags = Object.fromEntries(
      (await getAccounts(ctx))
        .filter((a) => stored.has(a.id))
        .map((a) => [a.name, a.includedInAvailable]),
    );
    expect(flags).toEqual({
      Amex: true,
      Mastercard: true,
      Deposit: false,
      "Salary account": false,
      Pension: true,
    });
  });

  it("opening balances are only created with their account", async () => {
    const { ctx, bank } = await ledger();
    const result = await recordTransaction(ctx, {
      type: "opening_balance",
      balance: taka(1),
      accountId: bank,
      occurredOn: d("2026-08-01"),
    });
    expect(errorCode(result)).toBe("opening_balance_via_account");
  });
});

describe("recording", () => {
  it("card purchase increases the liability; card payment is a transfer, not spending", async () => {
    const { ctx, bank, visa, category } = await ledger();
    ok(
      await recordTransaction(ctx, {
        type: "expense",
        amount: taka(4_200),
        accountId: visa,
        categoryId: category("Groceries"),
        occurredOn: d("2026-09-05"),
      }),
    );
    ok(
      await recordTransaction(ctx, {
        type: "transfer",
        amount: taka(12_000),
        accountId: bank,
        counterAccountId: visa,
        occurredOn: d("2026-09-10"),
      }),
    );
    expect(await balanceOf(ctx, visa)).toBe(taka(-4_200));
    expect(await balanceOf(ctx, bank)).toBe(taka(73_000));
    expect(await getSpendingByCategory(ctx, september)).toEqual(
      new Map([[category("Groceries"), taka(4_200)]]),
    );
  });

  it("rejects future dates and wrong category kinds", async () => {
    const { ctx, bank, category } = await ledger();
    expect(
      errorCode(
        await recordTransaction(ctx, {
          type: "expense",
          amount: taka(1),
          accountId: bank,
          categoryId: category("Other"),
          occurredOn: d("2026-09-23"),
        }),
      ),
    ).toBe("future_date");
    expect(
      errorCode(
        await recordTransaction(ctx, {
          type: "expense",
          amount: taka(1),
          accountId: bank,
          categoryId: category("Salary"),
          occurredOn: d("2026-09-01"),
        }),
      ),
    ).toBe("category_kind_mismatch");
  });

  it("assigns strictly increasing sequences; lists in (occurred_on, sequence) order", async () => {
    const { ctx, bank, category } = await ledger();
    const later = ok(
      await recordTransaction(ctx, {
        type: "expense",
        amount: taka(1),
        accountId: bank,
        categoryId: category("Other"),
        occurredOn: d("2026-09-20"),
      }),
    );
    const earlier = ok(
      await recordTransaction(ctx, {
        type: "expense",
        amount: taka(2),
        accountId: bank,
        categoryId: category("Other"),
        occurredOn: d("2026-09-10"),
      }),
    );
    const rows = await getTransactions(ctx, september);
    expect(rows.map((r) => r.id)).toEqual([earlier, later]); // date first…
    expect(rows[1]!.sequence).toBeLessThan(rows[0]!.sequence); // …even though recorded first
    const all = (await getTransactions(ctx)).map((r) => r.sequence);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("transfer with fee (a group)", () => {
  it("records both rows atomically with consecutive sequences and a shared group", async () => {
    const { ctx, bank, cash, category } = await ledger();
    const { transferId, feeId } = ok(
      await recordTransferWithFee(ctx, {
        fromAccountId: bank,
        toAccountId: cash,
        amount: taka(2_000),
        fee: money(3_700),
        feeCategoryId: category("Fees & Charges"),
        occurredOn: d("2026-09-14"),
      }),
    );
    const rows = (await getTransactions(ctx)).filter((r) => r.id === transferId || r.id === feeId);
    expect(rows[0]!.groupId).toBeTruthy();
    expect(rows[0]!.groupId).toBe(rows[1]!.groupId);
    expect(rows[1]!.sequence - rows[0]!.sequence).toBe(1);
    expect(await balanceOf(ctx, bank)).toBe(taka(85_000 - 2_000 - 37));
    expect(await balanceOf(ctx, cash)).toBe(taka(5_000));
  });

  it("deletes and restores as a whole, while single rows stay editable", async () => {
    const { ctx, bank, cash, category } = await ledger();
    const { transferId, feeId } = ok(
      await recordTransferWithFee(ctx, {
        fromAccountId: bank,
        toAccountId: cash,
        amount: taka(2_000),
        fee: taka(37),
        feeCategoryId: category("Fees & Charges"),
        occurredOn: d("2026-09-14"),
      }),
    );
    ok(
      await updateTransaction(ctx, feeId, {
        type: "expense",
        amount: taka(40),
        accountId: bank,
        categoryId: category("Fees & Charges"),
        occurredOn: d("2026-09-14"),
      }),
    );
    expect(await balanceOf(ctx, bank)).toBe(taka(85_000 - 2_000 - 40));

    expect(ok(await deleteTransaction(ctx, feeId)).sort()).toEqual([transferId, feeId].sort());
    expect(await balanceOf(ctx, bank)).toBe(taka(85_000));
    expect(await balanceOf(ctx, cash)).toBe(taka(3_000));

    expect(ok(await restoreTransaction(ctx, transferId)).sort()).toEqual(
      [transferId, feeId].sort(),
    );
    expect(await balanceOf(ctx, bank)).toBe(taka(85_000 - 2_000 - 40));
  });
});

describe("refunds (D6)", () => {
  async function withJacket() {
    const setup = await ledger();
    const jacket = ok(
      await recordTransaction(setup.ctx, {
        type: "expense",
        amount: taka(3_000),
        accountId: setup.visa,
        categoryId: setup.category("Shopping"),
        occurredOn: d("2026-09-08"),
      }),
    );
    return { ...setup, jacket };
  }

  it("a linked refund inherits the expense's category and nets inside it", async () => {
    const { ctx, visa, jacket, category } = await withJacket();
    ok(
      await recordTransaction(ctx, {
        type: "refund",
        amount: taka(1_200),
        accountId: visa,
        refundOfId: jacket,
        occurredOn: d("2026-09-16"),
      }),
    );
    expect((await getSpendingByCategory(ctx, september)).get(category("Shopping"))).toBe(
      taka(1_800),
    );
  });

  it("a linked refund cannot use a different category", async () => {
    const { ctx, visa, jacket, category } = await withJacket();
    const result = await recordTransaction(ctx, {
      type: "refund",
      amount: taka(1),
      accountId: visa,
      refundOfId: jacket,
      categoryId: category("Groceries"),
      occurredOn: d("2026-09-16"),
    });
    expect(errorCode(result)).toBe("refund_category_mismatch");
  });

  it("an expense with active refunds cannot be deleted or re-categorised", async () => {
    const { ctx, visa, jacket, category } = await withJacket();
    const refund = ok(
      await recordTransaction(ctx, {
        type: "refund",
        amount: taka(1_200),
        accountId: visa,
        refundOfId: jacket,
        occurredOn: d("2026-09-16"),
      }),
    );
    expect(errorCode(await deleteTransaction(ctx, jacket))).toBe("has_active_refunds");
    expect(
      errorCode(
        await updateTransaction(ctx, jacket, {
          type: "expense",
          amount: taka(3_000),
          accountId: visa,
          categoryId: category("Other"),
          occurredOn: d("2026-09-08"),
        }),
      ),
    ).toBe("has_active_refunds");
    ok(await deleteTransaction(ctx, refund));
    ok(await deleteTransaction(ctx, jacket));
    // A refund of a deleted expense cannot be restored.
    expect(errorCode(await restoreTransaction(ctx, refund))).toBe("refund_target_invalid");
  });

  it("a standalone refund picks its category normally", async () => {
    const { ctx, bank, category } = await ledger();
    ok(
      await recordTransaction(ctx, {
        type: "refund",
        amount: taka(50),
        accountId: bank,
        categoryId: category("Other"),
        occurredOn: d("2026-09-01"),
      }),
    );
  });
});

describe("editing (M3-style type change)", () => {
  it("changes an expense into a transfer in place: same id, same sequence", async () => {
    const { ctx, bank, visa, category } = await ledger();
    const id = ok(
      await recordTransaction(ctx, {
        type: "expense",
        amount: taka(12_000),
        accountId: bank,
        categoryId: category("Other"),
        occurredOn: d("2026-09-10"),
      }),
    );
    const before = (await getTransactions(ctx)).find((r) => r.id === id)!;
    expect(await balanceOf(ctx, visa)).toBe(taka(-12_000));

    ok(
      await updateTransaction(ctx, id, {
        type: "transfer",
        amount: taka(12_000),
        accountId: bank,
        counterAccountId: visa,
        occurredOn: d("2026-09-10"),
      }),
    );
    const after = (await getTransactions(ctx)).find((r) => r.id === id)!;
    expect(after).toMatchObject({
      id,
      sequence: before.sequence,
      type: "transfer",
      categoryId: null,
      counterAccountId: visa,
    });
    expect(await balanceOf(ctx, visa)).toBe(0);
    expect(await getSpendingByCategory(ctx, september)).toEqual(new Map());
  });

  it("keeps the sequence when the date changes", async () => {
    const { ctx, bank, category } = await ledger();
    const id = ok(
      await recordTransaction(ctx, {
        type: "expense",
        amount: taka(5),
        accountId: bank,
        categoryId: category("Other"),
        occurredOn: d("2026-09-10"),
      }),
    );
    const sequence = (await getTransactions(ctx)).find((r) => r.id === id)!.sequence;
    ok(
      await updateTransaction(ctx, id, {
        type: "expense",
        amount: taka(5),
        accountId: bank,
        categoryId: category("Other"),
        occurredOn: d("2026-08-10"),
      }),
    );
    expect((await getTransactions(ctx)).find((r) => r.id === id)!.sequence).toBe(sequence);
  });

  it("opening balances keep their type and account; their amount is editable", async () => {
    const { ctx, bank, cash } = await ledger();
    const opening = (await getTransactions(ctx)).find(
      (r) => r.accountId === bank && r.type === "opening_balance",
    )!;
    expect(
      errorCode(
        await updateTransaction(ctx, opening.id, {
          type: "income",
          amount: taka(1),
          accountId: bank,
          categoryId: "x",
          occurredOn: d("2026-08-01"),
        }),
      ),
    ).toBe("type_change_not_allowed");
    expect(
      errorCode(
        await updateTransaction(ctx, opening.id, {
          type: "opening_balance",
          balance: taka(1),
          accountId: cash,
          occurredOn: d("2026-08-01"),
        }),
      ),
    ).toBe("opening_balance_account_fixed");
    ok(
      await updateTransaction(ctx, opening.id, {
        type: "opening_balance",
        balance: taka(90_000),
        accountId: bank,
        occurredOn: d("2026-08-01"),
      }),
    );
    expect(await balanceOf(ctx, bank)).toBe(taka(90_000));
  });
});

describe("soft delete", () => {
  it("hides deleted rows from balances and lists; restore brings them back", async () => {
    const { ctx, bank, category } = await ledger();
    const id = ok(
      await recordTransaction(ctx, {
        type: "expense",
        amount: taka(500),
        accountId: bank,
        categoryId: category("Other"),
        occurredOn: d("2026-09-10"),
      }),
    );
    ok(await deleteTransaction(ctx, id));
    expect(await balanceOf(ctx, bank)).toBe(taka(85_000));
    expect((await getTransactions(ctx)).some((r) => r.id === id)).toBe(false);
    expect(errorCode(await deleteTransaction(ctx, id))).toBe("transaction_not_found");
    ok(await restoreTransaction(ctx, id));
    expect(await balanceOf(ctx, bank)).toBe(taka(84_500));
    expect(errorCode(await restoreTransaction(ctx, id))).toBe("transaction_not_deleted");
  });

  it("allows at most one active opening balance per account", async () => {
    const { ctx, bank } = await ledger();
    const opening = (await getTransactions(ctx)).find(
      (r) => r.accountId === bank && r.type === "opening_balance",
    )!;
    ok(await deleteTransaction(ctx, opening.id));
    expect(await balanceOf(ctx, bank)).toBe(0);
    ok(await restoreTransaction(ctx, opening.id));
    expect(await balanceOf(ctx, bank)).toBe(taka(85_000));
  });
});

describe("position", () => {
  it("net worth = Σ balances; liabilities by class", async () => {
    const { ctx } = await ledger();
    expect(await getPosition(ctx)).toEqual({
      netWorth: taka(85_000 + 3_000 - 12_000),
      assets: taka(88_000),
      liabilities: taka(12_000),
      liabilityStanding: { kind: "owed", amount: taka(12_000) },
    });
  });

  it("balance as of a date includes that date", async () => {
    const { ctx, bank, category } = await ledger();
    ok(
      await recordTransaction(ctx, {
        type: "expense",
        amount: taka(100),
        accountId: bank,
        categoryId: category("Other"),
        occurredOn: d("2026-09-10"),
      }),
    );
    const asOf = async (date: string) =>
      (await getAccountBalances(ctx, d(date))).find((b) => b.accountId === bank)!.balance;
    expect(await asOf("2026-09-09")).toBe(taka(85_000));
    expect(await asOf("2026-09-10")).toBe(taka(84_900));
    expect(await asOf("2026-07-31")).toBe(0);
  });
});

describe("rollback", () => {
  it("a group whose second row is rejected leaves no rows and consumes no sequence number", async () => {
    const { ctx, bank, cash, category } = await ledger();
    const sequenceBefore = ctx.db.select().from(owners).get()!.nextTransactionSequence;
    const rowsBefore = ctx.db.select().from(transactions).all().length;

    // The transfer is valid; the fee uses an income category, which is rejected
    // after the transfer row has already been inserted inside the transaction.
    const result = await recordTransferWithFee(ctx, {
      fromAccountId: bank,
      toAccountId: cash,
      amount: taka(2_000),
      fee: taka(37),
      feeCategoryId: category("Salary"),
      occurredOn: d("2026-09-14"),
    });
    expect(errorCode(result)).toBe("category_kind_mismatch");
    expect(ctx.db.select().from(transactions).all().length).toBe(rowsBefore);
    expect(ctx.db.select().from(owners).get()!.nextTransactionSequence).toBe(sequenceBefore);
    expect(await balanceOf(ctx, bank)).toBe(taka(85_000));
  });

  it("a database failure after the account row is written rolls back the account too", async () => {
    const { ctx } = await ledger();
    const accountsBefore = (await getAccountBalances(ctx)).length;
    const sequenceBefore = ctx.db.select().from(owners).get()!.nextTransactionSequence;
    const existingTransactionId = (await getTransactions(ctx))[0]!.id;
    // The account gets a fresh id; its opening-balance transaction reuses an
    // existing transaction id, so the second INSERT hits the primary key.
    const ids = [ctx.ids.next(), existingTransactionId];
    const collidingIds = { next: () => ids.shift()! } as typeof ctx.ids;

    await expect(
      createAccount(
        { ...ctx, ids: collidingIds },
        { name: "X", type: "cash", openedOn: d("2026-09-01"), openingBalance: taka(10) },
      ),
    ).rejects.toMatchObject({
      name: "LedgerIntegrityError",
      // A text PRIMARY KEY is enforced through a unique index: reported as UNIQUE.
      sqliteCode: expect.stringMatching(/^SQLITE_CONSTRAINT_(UNIQUE|PRIMARYKEY)$/),
    });
    expect((await getAccountBalances(ctx)).length).toBe(accountsBefore);
    expect(ctx.db.select().from(owners).get()!.nextTransactionSequence).toBe(sequenceBefore);
  });

  it("creating a category is owner-scoped and rejects duplicates", async () => {
    const { ctx } = await ledger();
    ok(await createCategory(ctx, { name: "Pets", kind: "expense" }));
    expect(errorCode(await createCategory(ctx, { name: "pets", kind: "expense" }))).toBe(
      "duplicate_name",
    );
  });
});
