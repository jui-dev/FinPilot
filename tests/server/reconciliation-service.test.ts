import { count, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import { owners, reconciliationCheckpoints, transactions } from "@/db/schema";
import { inclusiveRange, monthRange, yearMonth, type CalendarDate } from "@/domain/calendar-date";
import { NEVER_VERIFIED } from "@/domain/ledger/verification";
import { add, subtract, ZERO } from "@/domain/money";
import {
  deleteTransaction,
  getAccountBalances,
  getIncome,
  getTotalSpending,
  recordTransaction,
  restoreTransaction,
  updateTransaction,
} from "@/server/services/ledger-service";
import { getActivity } from "@/server/services/activity-service";
import {
  getAccountVerifications,
  getCurrentCheckpoints,
  verifyAccountBalance,
} from "@/server/services/reconciliation-service";
import { archiveAccount, createOwner, deleteAccount } from "@/server/services/setup-service";

import { buildSeptember2026, type Scenario } from "../../acceptance/fixtures/september-2026";
import { d, errorCode, ok, setupLedger, taka } from "../support/ledger";

/**
 * Verifying an account balance (Stage 4a): the difference, the adjustment, the
 * checkpoint, and the invariants they must not break. Checkpoint *status*
 * ("verified" vs "changed since verified") is Stage 4b and is not tested here.
 */

let handle: DatabaseHandle | undefined;
afterEach(() => handle?.close());

async function ledger() {
  const setup = await setupLedger();
  handle = setup.handle;
  // Cash reaches 4,550 on 20 Sep, exactly as the acceptance scenario does.
  const cash = await setup.account("Cash", "cash", "2026-08-01", 2_200);
  const bank = await setup.account("Bank", "bank", "2026-08-01", 50_000);
  const visa = await setup.account("Visa", "credit_card", "2026-08-01", -6_000);
  ok(
    await recordTransaction(setup.ctx, {
      type: "transfer",
      amount: taka(2_000),
      accountId: bank,
      counterAccountId: cash,
      occurredOn: d("2026-09-14"),
    }),
  );
  ok(
    await recordTransaction(setup.ctx, {
      type: "expense",
      amount: taka(450),
      accountId: cash,
      categoryId: setup.category("Food & Dining"),
      occurredOn: d("2026-09-15"),
    }),
  );
  ok(
    await recordTransaction(setup.ctx, {
      type: "income",
      amount: taka(800),
      accountId: cash,
      categoryId: setup.category("Other Income"),
      occurredOn: d("2026-09-16"),
    }),
  );
  return { ...setup, cash, bank, visa };
}

const balanceOf = async (
  ctx: Parameters<typeof getAccountBalances>[0],
  id: string,
  asOf?: CalendarDate,
) => (await getAccountBalances(ctx, asOf)).find((b) => b.accountId === id)!.balance;

const rowCount = (h: DatabaseHandle, ownerId: string) =>
  h.db.select({ n: count() }).from(transactions).where(eq(transactions.ownerId, ownerId)).get()!.n;

const checkpoints = (h: DatabaseHandle, ownerId: string) =>
  h.db
    .select()
    .from(reconciliationCheckpoints)
    .where(eq(reconciliationCheckpoints.ownerId, ownerId))
    .all();

describe("verifying a balance", () => {
  it("posts the correcting adjustment and records the checkpoint", async () => {
    const { ctx, cash } = await ledger();
    expect(await balanceOf(ctx, cash, d("2026-09-20"))).toBe(taka(4_550));

    const result = ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: taka(4_200),
      }),
    );

    expect(result.recorded).toBe(taka(4_550));
    expect(result.stated).toBe(taka(4_200));
    expect(result.difference).toBe(taka(-350));
    expect(result.adjustmentId).not.toBeNull();
    expect(await balanceOf(ctx, cash, d("2026-09-20"))).toBe(taka(4_200));
  });

  it("records the checkpoint and posts nothing when the ledger already agrees", async () => {
    const { ctx, cash } = await ledger();
    const before = rowCount(handle!, ctx.ownerId);

    const result = ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: taka(4_550),
      }),
    );

    expect(result.difference).toBe(ZERO);
    expect(result.adjustmentId).toBeNull();
    expect(rowCount(handle!, ctx.ownerId)).toBe(before);
    expect(checkpoints(handle!, ctx.ownerId)).toHaveLength(1);
  });

  it("corrects the balance as of the checkpoint date, not the balance today", async () => {
    // The temporal rule: an adjustment fixes history; later transactions still
    // move the balance afterwards.
    const { ctx, cash, category } = await ledger();
    ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: taka(4_200),
      }),
    );
    ok(
      await recordTransaction(ctx, {
        type: "expense",
        amount: taka(500),
        accountId: cash,
        categoryId: category("Food & Dining"),
        occurredOn: d("2026-09-21"),
      }),
    );

    expect(await balanceOf(ctx, cash, d("2026-09-20"))).toBe(taka(4_200));
    expect(await balanceOf(ctx, cash)).toBe(taka(3_700));
  });

  it("states a liability as money owed", async () => {
    const { ctx, visa } = await ledger();
    const result = ok(
      await verifyAccountBalance(ctx, {
        accountId: visa,
        asOf: d("2026-09-20"),
        countedAmount: taka(6_500),
      }),
    );
    expect(result.stated).toBe(taka(-6_500));
    expect(result.difference).toBe(taka(-500));
    expect(await balanceOf(ctx, visa)).toBe(taka(-6_500));
  });

  it("accepts zero as a real counted balance", async () => {
    const { ctx, cash } = await ledger();
    const result = ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: ZERO,
      }),
    );
    expect(result.difference).toBe(taka(-4_550));
    expect(await balanceOf(ctx, cash, d("2026-09-20"))).toBe(ZERO);
  });

  it("keeps several verifications of the same account and date", async () => {
    // A checkpoint is a historical observation, never an upsert.
    const { ctx, cash } = await ledger();
    ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: taka(4_200),
      }),
    );
    ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: taka(4_000),
      }),
    );

    const recorded = checkpoints(handle!, ctx.ownerId);
    expect(recorded).toHaveLength(2);
    expect(recorded.map((c) => c.statedBalanceMinor).sort((a, b) => a - b)).toEqual([
      taka(4_000),
      taka(4_200),
    ]);
    // The second correction is relative to the first: 4,200 → 4,000.
    expect(await balanceOf(ctx, cash, d("2026-09-20"))).toBe(taka(4_000));
  });
});

describe("what verifying must not break", () => {
  it("never counts an adjustment as income or spending", async () => {
    const { ctx, cash } = await ledger();
    const september = monthRange(yearMonth(2026, 9));
    const spendingBefore = await getTotalSpending(ctx, september);
    const incomeBefore = await getIncome(ctx, september);

    ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: taka(4_200),
      }),
    );

    expect(await getTotalSpending(ctx, september)).toBe(spendingBefore);
    expect(await getIncome(ctx, september)).toBe(incomeBefore);
  });

  it("writes nothing at all when it is rejected", async () => {
    const { ctx, cash } = await ledger();
    const before = {
      rows: rowCount(handle!, ctx.ownerId),
      sequence: handle!.db
        .select({ next: owners.nextTransactionSequence })
        .from(owners)
        .where(eq(owners.id, ctx.ownerId))
        .get()!.next,
    };

    const future = await verifyAccountBalance(ctx, {
      accountId: cash,
      asOf: d("2026-09-23"),
      countedAmount: taka(4_200),
    });

    expect(errorCode(future)).toBe("future_date");
    expect(checkpoints(handle!, ctx.ownerId)).toHaveLength(0);
    expect(rowCount(handle!, ctx.ownerId)).toBe(before.rows);
    expect(
      handle!.db
        .select({ next: owners.nextTransactionSequence })
        .from(owners)
        .where(eq(owners.id, ctx.ownerId))
        .get()!.next,
    ).toBe(before.sequence);
  });

  it("refuses dates before the account existed and archived accounts", async () => {
    const { ctx, cash, bank } = await ledger();
    expect(
      errorCode(
        await verifyAccountBalance(ctx, {
          accountId: cash,
          asOf: d("2026-07-31"),
          countedAmount: taka(10),
        }),
      ),
    ).toBe("before_opened_on");

    // An account can only be archived at a zero balance.
    ok(
      await verifyAccountBalance(ctx, {
        accountId: bank,
        asOf: d("2026-09-20"),
        countedAmount: ZERO,
      }),
    );
    ok(await archiveAccount(ctx, bank));
    expect(
      errorCode(
        await verifyAccountBalance(ctx, {
          accountId: bank,
          asOf: d("2026-09-20"),
          countedAmount: taka(10),
        }),
      ),
    ).toBe("account_archived");
  });

  it("will not let the adjustment be deleted on its own", async () => {
    const { ctx, cash } = await ledger();
    const { adjustmentId } = ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: taka(4_200),
      }),
    );

    expect(errorCode(await deleteTransaction(ctx, adjustmentId!))).toBe("adjustment_in_checkpoint");
    expect(await balanceOf(ctx, cash, d("2026-09-20"))).toBe(taka(4_200));
  });

  it("will not let the adjustment be edited", async () => {
    const { ctx, cash, category } = await ledger();
    const { adjustmentId } = ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: taka(4_200),
      }),
    );

    expect(
      errorCode(
        await updateTransaction(ctx, adjustmentId!, {
          type: "expense",
          amount: taka(350),
          accountId: cash,
          categoryId: category("Food & Dining"),
          occurredOn: d("2026-09-20"),
        }),
      ),
    ).toBe("adjustment_not_editable");
  });

  it("counts a checkpoint as a reference, so the account cannot be deleted", async () => {
    // An account verified at a matching balance has a checkpoint and no
    // transaction: without counting checkpoints this would pass the check and
    // then fail at the foreign key.
    const setup = await setupLedger();
    handle = setup.handle;
    const empty = await setup.account("Wallet", "cash", "2026-09-01");

    ok(
      await verifyAccountBalance(setup.ctx, {
        accountId: empty,
        asOf: d("2026-09-20"),
        countedAmount: ZERO,
      }),
    );

    expect(errorCode(await deleteAccount(setup.ctx, empty))).toBe("account_in_use");
  });
});

describe("whether an account is still as verified", () => {
  const statusOf = async (ctx: Parameters<typeof getAccountVerifications>[0], id: string) =>
    (await getAccountVerifications(ctx, [id])).get(id)!;

  it("reports never_verified until the account is verified", async () => {
    const { ctx, cash } = await ledger();
    expect(await statusOf(ctx, cash)).toEqual(NEVER_VERIFIED);
  });

  it("is verified immediately after reconciling", async () => {
    const { ctx, cash } = await ledger();
    ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: taka(4_200),
      }),
    );
    // The adjustment is dated Sep 20 and is part of that date's balance, so it
    // cannot invalidate the checkpoint that created it.
    expect(await statusOf(ctx, cash)).toMatchObject({
      status: "verified",
      asOf: "2026-09-20",
      stated: taka(4_200),
      drift: ZERO,
    });
  });

  it("is verified after a checkpoint that needed no adjustment", async () => {
    const { ctx, cash } = await ledger();
    ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: taka(4_550),
      }),
    );
    expect(await statusOf(ctx, cash)).toMatchObject({ status: "verified", drift: ZERO });
  });

  it("stays verified when a later transaction is recorded", async () => {
    const { ctx, cash, category } = await ledger();
    ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: taka(4_200),
      }),
    );
    ok(
      await recordTransaction(ctx, {
        type: "expense",
        amount: taka(500),
        accountId: cash,
        categoryId: category("Food & Dining"),
        occurredOn: d("2026-09-21"),
      }),
    );
    expect(await statusOf(ctx, cash)).toMatchObject({ status: "verified", drift: ZERO });
  });

  it("changes when a transaction dated before the checkpoint is added", async () => {
    const { ctx, cash, category } = await ledger();
    ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: taka(4_200),
      }),
    );
    ok(
      await recordTransaction(ctx, {
        type: "expense",
        amount: taka(300),
        accountId: cash,
        categoryId: category("Food & Dining"),
        occurredOn: d("2026-09-18"),
      }),
    );
    // The ledger now derives 300 less than was verified.
    expect(await statusOf(ctx, cash)).toMatchObject({ status: "changed", drift: taka(-300) });
  });

  it("changes when a transaction dated on the checkpoint date itself is added", async () => {
    // Deliberate for V1: verification is date-granular, so a same-day entry
    // recorded afterwards does change the end-of-day balance.
    const { ctx, cash, category } = await ledger();
    ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: taka(4_200),
      }),
    );
    ok(
      await recordTransaction(ctx, {
        type: "expense",
        amount: taka(50),
        accountId: cash,
        categoryId: category("Food & Dining"),
        occurredOn: d("2026-09-20"),
      }),
    );
    expect(await statusOf(ctx, cash)).toMatchObject({ status: "changed", drift: taka(-50) });
  });

  it("changes when a transfer into the account is backdated (the mirrored leg counts)", async () => {
    const { ctx, cash, bank } = await ledger();
    ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: taka(4_200),
      }),
    );
    ok(
      await recordTransaction(ctx, {
        type: "transfer",
        amount: taka(1_000),
        accountId: bank,
        counterAccountId: cash,
        occurredOn: d("2026-09-19"),
      }),
    );
    expect(await statusOf(ctx, cash)).toMatchObject({ status: "changed", drift: taka(1_000) });
  });

  it("returns to verified when the ledger is put back as it was", async () => {
    const { ctx, cash, category } = await ledger();
    ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: taka(4_200),
      }),
    );
    const strayId = ok(
      await recordTransaction(ctx, {
        type: "expense",
        amount: taka(300),
        accountId: cash,
        categoryId: category("Food & Dining"),
        occurredOn: d("2026-09-18"),
      }),
    );
    expect((await statusOf(ctx, cash)).status).toBe("changed");

    ok(await deleteTransaction(ctx, strayId));
    expect(await statusOf(ctx, cash)).toMatchObject({ status: "verified", drift: ZERO });

    // ...and breaks again when it comes back.
    ok(await restoreTransaction(ctx, strayId));
    expect((await statusOf(ctx, cash)).status).toBe("changed");
  });

  it("uses the latest checkpoint when an account is verified twice on one day", async () => {
    const { ctx, cash } = await ledger();
    ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: taka(4_200),
      }),
    );
    ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: taka(4_000),
      }),
    );
    // The second verification governs: stated 4,000, and the ledger agrees.
    expect(await statusOf(ctx, cash)).toMatchObject({
      status: "verified",
      stated: taka(4_000),
      drift: ZERO,
    });
  });

  it("uses the latest date when checkpoints are on different days", async () => {
    const { ctx, cash, category } = await ledger();
    ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-18"),
        countedAmount: taka(4_550),
      }),
    );
    ok(
      await recordTransaction(ctx, {
        type: "expense",
        amount: taka(100),
        accountId: cash,
        categoryId: category("Food & Dining"),
        occurredOn: d("2026-09-19"),
      }),
    );
    const later = ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-21"),
        countedAmount: taka(4_000),
      }),
    );
    expect(later.adjustmentId).not.toBeNull();
    expect(await statusOf(ctx, cash)).toMatchObject({ status: "verified", asOf: "2026-09-21" });
  });

  it("keeps reporting status for an archived account", async () => {
    const setup = await setupLedger();
    handle = setup.handle;
    const wallet = await setup.account("Wallet", "cash", "2026-09-01");
    ok(
      await verifyAccountBalance(setup.ctx, {
        accountId: wallet,
        asOf: d("2026-09-20"),
        countedAmount: ZERO,
      }),
    );
    ok(await archiveAccount(setup.ctx, wallet));
    expect(await statusOf(setup.ctx, wallet)).toMatchObject({ status: "verified" });
  });

  it("keeps each account's verification separate", async () => {
    const { ctx, cash, bank, visa } = await ledger();
    ok(
      await verifyAccountBalance(ctx, {
        accountId: cash,
        asOf: d("2026-09-20"),
        countedAmount: taka(4_200),
      }),
    );
    const all = await getAccountVerifications(ctx, [cash, bank, visa]);
    expect(all.get(cash)?.status).toBe("verified");
    expect(all.get(bank)?.status).toBe("never_verified");
    expect(all.get(visa)?.status).toBe("never_verified");
  });
});

/**
 * The evidence behind a changed checkpoint (Milestone B close-out): Accounts
 * links to the account's Activity from its opening date through the checkpoint
 * date. That list must be exactly the entries that compose the recorded
 * balance for that day — as the ledger stands now. It is not a list of what
 * changed: an entry moved to another account or deleted is simply absent.
 */
describe("the entries behind a checkpoint", () => {
  /** The account's side of each listed row (a transfer counts on either end). */
  async function evidence(s: Scenario, accountId: string, asOf: CalendarDate) {
    const { items } = await getActivity(s.ctx, {
      accountId,
      range: inclusiveRange("2026-08-01", asOf)!,
    });
    let total = ZERO;
    for (const row of items.flatMap((i) => (i.fee ? [i.primary, i.fee] : [i.primary]))) {
      if (row.account.id === accountId) total = add(total, row.amount);
      if (row.counterAccount?.id === accountId) total = subtract(total, row.amount);
    }
    return { ids: items.map((i) => i.primary.id), types: items.map((i) => i.primary.type), total };
  }

  it("lists exactly the entries that make up the verified Cash balance on Sep 20", async () => {
    const s = await buildSeptember2026();
    handle = s.handle;
    const status = (await getAccountVerifications(s.ctx, [s.accounts.cash])).get(s.accounts.cash)!;
    const { ids, types, total } = await evidence(s, s.accounts.cash, d("2026-09-20"));

    expect(status.status).toBe("verified");
    expect(total).toBe(status.recorded);
    expect(total).toBe(taka(4_200));
    // The adjustment, both cash-outs (in), the Sep 15 lunch and Aug 15 food,
    // and the opening balance; nothing dated after Sep 20.
    expect(ids.slice(0, 5)).toEqual([s.rows.R10, s.rows.R8, s.rows.R7, s.rows.P6, s.rows.P5]);
    expect(types).toEqual([
      "adjustment",
      "expense",
      "transfer",
      "expense",
      "transfer",
      "opening_balance",
    ]);
  });

  it("still composes the recorded amount under M2, though the moved lunch is not listed", async () => {
    const s = await buildSeptember2026();
    handle = s.handle;
    ok(
      await updateTransaction(s.ctx, s.rows.R8!, {
        type: "expense",
        amount: taka(450),
        accountId: s.accounts.bkash,
        categoryId: s.category("Food & Dining"),
        occurredOn: d("2026-09-15"),
      }),
    );
    const status = (await getAccountVerifications(s.ctx, [s.accounts.cash])).get(s.accounts.cash)!;
    const { ids, total } = await evidence(s, s.accounts.cash, d("2026-09-20"));

    expect(status).toMatchObject({ status: "changed", recorded: taka(4_650), drift: taka(450) });
    expect(total).toBe(status.recorded);
    // The entry whose move changed the checkpoint now lives on bKash.
    expect(ids).not.toContain(s.rows.R8);
  });

  it("leaves no trace of a deleted entry, and still composes the recorded amount", async () => {
    const s = await buildSeptember2026();
    handle = s.handle;
    ok(await deleteTransaction(s.ctx, s.rows.P6!));
    const status = (await getAccountVerifications(s.ctx, [s.accounts.cash])).get(s.accounts.cash)!;
    const { ids, total } = await evidence(s, s.accounts.cash, d("2026-09-20"));

    expect(status).toMatchObject({ status: "changed", recorded: taka(5_400), drift: taka(1_200) });
    expect(total).toBe(status.recorded);
    expect(ids).not.toContain(s.rows.P6);
  });
});

/**
 * The current checkpoint with the adjustment verifying it posted (Stage 9):
 * the same status as getAccountVerifications, plus what Attention needs to
 * name an unexplained difference.
 */
describe("current checkpoints and their adjustments", () => {
  it("reports the Sep 20 Cash checkpoint's −350 adjustment with the same status", async () => {
    const s = await buildSeptember2026();
    handle = s.handle;
    const checkpoints = await getCurrentCheckpoints(s.ctx);
    const status = (await getAccountVerifications(s.ctx, [s.accounts.cash])).get(s.accounts.cash)!;

    // Only the verified account is present.
    expect(checkpoints).toEqual([
      {
        accountId: s.accounts.cash,
        verification: status,
        adjustment: { transactionId: s.rows.R10, amount: taka(-350) },
      },
    ]);
  });

  it("has no adjustment when the ledger already agreed, and follows the latest checkpoint", async () => {
    const s = await buildSeptember2026();
    handle = s.handle;
    // bKash already holds 8,963 on Sep 18: no adjustment is needed.
    ok(
      await verifyAccountBalance(s.ctx, {
        accountId: s.accounts.bkash,
        asOf: d("2026-09-18"),
        countedAmount: taka(8_963),
      }),
    );
    // Cash verified again on Sep 22 at what it holds: the new checkpoint has no adjustment.
    ok(
      await verifyAccountBalance(s.ctx, {
        accountId: s.accounts.cash,
        asOf: d("2026-09-22"),
        countedAmount: taka(4_200),
      }),
    );
    const byAccount = new Map((await getCurrentCheckpoints(s.ctx)).map((c) => [c.accountId, c]));

    expect(byAccount.get(s.accounts.bkash)).toMatchObject({
      verification: { status: "verified", asOf: "2026-09-18" },
      adjustment: null,
    });
    expect(byAccount.get(s.accounts.cash)).toMatchObject({
      verification: { status: "verified", asOf: "2026-09-22" },
      adjustment: null,
    });
  });

  it("reads another owner's checkpoints as absent", async () => {
    const s = await buildSeptember2026();
    handle = s.handle;
    const other = await createOwner(
      { db: s.ctx.db, ids: s.ctx.ids, now: s.ctx.now },
      { name: "Other", baseCurrency: "BDT", timeZone: "Asia/Dhaka" },
    );
    expect(await getCurrentCheckpoints({ ...s.ctx, ownerId: ok(other) })).toEqual([]);
  });
});
