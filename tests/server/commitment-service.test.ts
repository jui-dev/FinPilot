import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import type { Clock } from "@/domain/clock";
import type { CommitmentFrequency } from "@/domain/commitments/schedule";
import {
  createCommitment as createCommitmentCommand,
  payOccurrence as payCommand,
} from "@/server/commands";
import type { ServiceContext } from "@/server/context";
import {
  createCommitment,
  editCommitment,
  getCommitments,
  getOccurrences,
  payOccurrence,
  skipOccurrence,
  type CommitmentDraft,
  type OccurrenceView,
} from "@/server/services/commitment-service";
import {
  deleteTransaction,
  getAccountBalances,
  getTransactions,
  restoreTransaction,
  updateTransaction,
} from "@/server/services/ledger-service";
import {
  archiveAccount,
  archiveCategory,
  createAccount,
  createOwner,
  deleteAccount,
  deleteCategory,
  getAccountReferenceCounts,
  getCategories,
  getCategoryReferenceCounts,
} from "@/server/services/setup-service";

import { d, errorCode, ok, setupLedger, taka } from "../support/ledger";

/**
 * Commitments on a real database (Stage 6, Slice 2): persistence, lazy
 * materialisation, rule edits, Pay and Skip, and how occurrences read when the
 * ledger changes under them. Today is movable, because the historical-backfill
 * rule is about what happens when time passes without a read.
 */

let handle: DatabaseHandle | undefined;
afterEach(() => handle?.close());

async function commitmentLedger(today = "2026-09-22") {
  const setup = await setupLedger(today);
  handle = setup.handle;
  let current = d(today);
  const clock: Clock = { today: () => current };
  const ctx: ServiceContext = { ...setup.ctx, clock };
  const bank = await setup.account("Bank", "bank", "2026-01-01", 200_000);
  const cash = await setup.account("Cash", "cash", "2026-01-01", 5_000);
  const housing = setup.category("Housing");

  const draft = (patch: Partial<CommitmentDraft> = {}): CommitmentDraft => ({
    name: "Rent",
    categoryId: housing,
    expectedAmount: taka(30_000),
    expectedAccountId: bank,
    frequency: "monthly" as CommitmentFrequency,
    interval: 1,
    anchorOn: d("2026-08-01"),
    endOn: null,
    ...patch,
  });
  const create = async (patch: Partial<CommitmentDraft> = {}) =>
    ok(await createCommitment(ctx, draft(patch)));

  /** Occurrences of one commitment keyed by due date. */
  const occurrences = async (commitmentId: string) =>
    Object.fromEntries(
      (await getOccurrences(ctx))
        .filter((o) => o.commitmentId === commitmentId)
        .map((o) => [o.dueOn, o] as const),
    ) as Record<string, OccurrenceView>;

  const transactionCount = () =>
    (handle!.sqlite.prepare("SELECT count(*) AS n FROM transactions").get() as { n: number }).n;
  const nextSequence = () =>
    (
      handle!.sqlite.prepare("SELECT next_transaction_sequence AS n FROM owners").get() as {
        n: number;
      }
    ).n;
  const balanceOf = async (accountId: string) =>
    (await getAccountBalances(ctx)).find((b) => b.accountId === accountId)!.balance;

  return {
    ctx,
    setup,
    bank,
    cash,
    housing,
    draft,
    create,
    occurrences,
    transactionCount,
    nextSequence,
    balanceOf,
    travel: (to: string) => {
      current = d(to);
    },
  };
}

const dates = (byDate: Record<string, OccurrenceView>) => Object.keys(byDate).sort();

// ---------------------------------------------------------------------------
// Creating commitments
// ---------------------------------------------------------------------------

describe("createCommitment", () => {
  it("stores the rule with its generation boundary at the anchor", async () => {
    const { ctx, create, bank, housing } = await commitmentLedger();
    const id = await create({ name: "  Rent  " });
    expect(await getCommitments(ctx)).toEqual([
      {
        id,
        name: "Rent",
        categoryId: housing,
        expectedAmount: taka(30_000),
        expectedAccountId: bank,
        frequency: "monthly",
        interval: 1,
        anchorOn: "2026-08-01",
        endOn: null,
        generateFrom: "2026-08-01",
      },
    ]);
  });

  it("creates no transaction and no occurrence until they are read", async () => {
    const { create, transactionCount } = await commitmentLedger();
    const before = transactionCount();
    await create();
    expect(transactionCount()).toBe(before);
    expect(
      handle!.sqlite.prepare("SELECT count(*) AS n FROM commitment_occurrences").get(),
    ).toEqual({ n: 0 });
  });

  it("rejects an invalid rule, a non-spending or archived category, and an unknown account", async () => {
    const { ctx, draft, setup } = await commitmentLedger();
    const code = async (patch: Partial<CommitmentDraft>) =>
      errorCode(await createCommitment(ctx, draft(patch)));

    expect(await code({ name: "   " })).toBe("invalid_name");
    expect(await code({ interval: 0 })).toBe("invalid_interval");
    expect(await code({ endOn: d("2026-07-31") })).toBe("end_before_anchor");
    expect(await code({ categoryId: setup.category("Salary") })).toBe("category_kind_mismatch");
    expect(await code({ categoryId: "missing" })).toBe("category_not_found");
    expect(await code({ expectedAccountId: "missing" })).toBe("account_not_found");

    ok(await archiveCategory(ctx, setup.category("Other")));
    expect(await code({ categoryId: setup.category("Other") })).toBe("category_archived");
  });

  it("accepts a commitment with no expected account", async () => {
    const { create, ctx } = await commitmentLedger();
    await create({ expectedAccountId: null });
    expect((await getCommitments(ctx))[0]!.expectedAccountId).toBeNull();
  });

  it("maps command input and rule rejections to the form field", async () => {
    const { ctx, housing } = await commitmentLedger();
    const input = {
      name: "Rent",
      categoryId: housing,
      expectedAmount: "30000",
      frequency: "monthly",
      interval: "1",
      anchorOn: "2026-08-01",
    };
    expect(await createCommitmentCommand(ctx, { ...input, interval: "0" })).toMatchObject({
      ok: false,
      fieldErrors: { interval: expect.any(String) },
    });
    expect(await createCommitmentCommand(ctx, { ...input, frequency: "weekly" })).toMatchObject({
      ok: false,
      fieldErrors: { frequency: expect.any(String) },
    });
    expect(await createCommitmentCommand(ctx, { ...input, endOn: "2026-07-01" })).toMatchObject({
      ok: false,
      fieldErrors: { endOn: "A commitment cannot end before its first due date." },
    });
    expect((await createCommitmentCommand(ctx, input)).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Lazy materialisation
// ---------------------------------------------------------------------------

describe("lazy materialisation", () => {
  it("materialises from the anchor through today + 60 days", async () => {
    const { create, occurrences } = await commitmentLedger();
    const id = await create();
    expect(dates(await occurrences(id))).toEqual([
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
    ]);
  });

  it("creates nothing before a future anchor", async () => {
    const { create, occurrences } = await commitmentLedger();
    const id = await create({ anchorOn: d("2026-10-03") });
    expect(dates(await occurrences(id))).toEqual(["2026-10-03", "2026-11-03"]);
  });

  it("is idempotent: reading again creates nothing and changes nothing", async () => {
    const { ctx, create } = await commitmentLedger();
    await create();
    await create({ name: "Internet", anchorOn: d("2026-08-25"), expectedAmount: taka(1_500) });
    const first = await getOccurrences(ctx);
    const second = await getOccurrences(ctx);
    expect(second).toEqual(first);
    expect(
      handle!.sqlite.prepare("SELECT count(*) AS n FROM commitment_occurrences").get(),
    ).toEqual({ n: first.length });
  });

  it("extends the window as time passes, never duplicating", async () => {
    const { create, occurrences, travel } = await commitmentLedger();
    const id = await create();
    await occurrences(id);
    travel("2026-10-15");
    expect(dates(await occurrences(id))).toEqual([
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
      "2026-12-01",
    ]);
  });

  it("derives the pending timing from today", async () => {
    const { create, occurrences } = await commitmentLedger();
    const id = await create({ anchorOn: d("2026-08-22") });
    const byDate = await occurrences(id);
    expect(byDate["2026-08-22"]!.display).toBe("overdue");
    expect(byDate["2026-09-22"]!.display).toBe("due_today");
    expect(byDate["2026-10-22"]!.display).toBe("upcoming");
  });
});

// ---------------------------------------------------------------------------
// Editing the rule
// ---------------------------------------------------------------------------

describe("editCommitment: the historical-backfill rule", () => {
  it("materialises the old rule first, keeps history, and never manufactures past dates of the new rule", async () => {
    const { ctx, create, draft, occurrences, travel, cash } = await commitmentLedger("2026-09-20");
    const id = await create();

    // Last read on Sep 20: Aug 1 … Nov 1 exist. Aug 1 is paid, Sep 1 skipped.
    const sep20 = await occurrences(id);
    expect(dates(sep20)).toEqual(["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01"]);
    ok(await payOccurrence(ctx, sep20["2026-08-01"]!.id, { accountId: cash }));
    ok(await skipOccurrence(ctx, sep20["2026-09-01"]!.id));

    // No reads until Dec 5; Dec 1 fell due under the old rule meanwhile.
    travel("2026-12-05");
    ok(await editCommitment(ctx, id, draft({ anchorOn: d("2026-08-15") })));

    const after = await occurrences(id);
    expect(dates(after)).toEqual([
      "2026-08-01", // paid history
      "2026-09-01", // skipped history
      "2026-10-01", // past, untouched: history
      "2026-11-01",
      "2026-12-01", // due under the old rule since the last read: preserved
      "2026-12-15", // the new rule, from tomorrow on
      "2027-01-15",
    ]);
    expect(after["2026-08-01"]!.state).toBe("paid");
    expect(after["2026-09-01"]!.state).toBe("skipped");
    expect(after["2026-12-01"]).toMatchObject({ state: "pending", display: "overdue" });
    expect((await getCommitments(ctx))[0]).toMatchObject({
      anchorOn: "2026-08-15",
      generateFrom: "2026-12-06",
    });

    // A later read adds nothing: Aug 15 … Nov 15 are never created.
    expect(await getOccurrences(ctx)).toEqual(await getOccurrences(ctx));
    travel("2027-01-10");
    expect(dates(await occurrences(id)).filter((date) => date.endsWith("-15"))).toEqual([
      "2026-12-15",
      "2027-01-15",
      "2027-02-15", // Jan 10 + 60 days = Mar 11, so Mar 15 is not yet materialised
    ]);
  });

  it("does not backfill when a rule is re-opened after its end date", async () => {
    const { ctx, create, draft, occurrences, travel } = await commitmentLedger();
    const id = await create({ endOn: d("2026-09-30") });
    expect(dates(await occurrences(id))).toEqual(["2026-08-01", "2026-09-01"]);

    travel("2026-12-10");
    ok(await editCommitment(ctx, id, draft({ endOn: null })));
    // Oct 1, Nov 1 and Dec 1 were never obligations; the rule resumes from tomorrow.
    expect(dates(await occurrences(id))).toEqual([
      "2026-08-01",
      "2026-09-01",
      "2027-01-01",
      "2027-02-01",
    ]);
  });
});

describe("editCommitment: a rule created with a future anchor", () => {
  it("moved earlier, keeps generating every later date as time passes", async () => {
    // Created on Sep 22 to start next June; edited the same day to start Oct 1.
    const { ctx, create, draft, occurrences, travel } = await commitmentLedger();
    const id = await create({ anchorOn: d("2027-06-01") });
    expect(dates(await occurrences(id))).toEqual([]);
    // The boundary marks history only: never set in the future.
    expect((await getCommitments(ctx))[0]!.generateFrom).toBe("2026-09-22");
    ok(await editCommitment(ctx, id, draft({ anchorOn: d("2026-10-01") })));
    expect(dates(await occurrences(id))).toEqual(["2026-10-01", "2026-11-01"]);

    // Months later, nothing between Dec and May may be missing.
    travel("2027-02-10");
    expect(dates(await occurrences(id))).toEqual([
      "2026-10-01",
      "2026-11-01",
      "2026-12-01",
      "2027-01-01",
      "2027-02-01",
      "2027-03-01",
      "2027-04-01",
    ]);
  });
});

describe("editCommitment: what a rule edit may change", () => {
  /** Today Sep 10; the 10th monthly from Jun 10. */
  async function history() {
    const env = await commitmentLedger("2026-09-10");
    const id = await env.create({ anchorOn: d("2026-06-10") });
    const byDate = await env.occurrences(id);
    ok(await payOccurrence(env.ctx, byDate["2026-07-10"]!.id, { accountId: env.bank }));
    ok(await skipOccurrence(env.ctx, byDate["2026-08-10"]!.id));
    return { ...env, id, before: await env.occurrences(id) };
  }

  it("re-prices only future untouched occurrences", async () => {
    const { ctx, id, draft, occurrences, before } = await history();
    ok(
      await editCommitment(
        ctx,
        id,
        draft({ anchorOn: d("2026-06-10"), expectedAmount: taka(32_000) }),
      ),
    );
    const after = await occurrences(id);

    // Overdue, paid, skipped and due-today keep their row and their snapshot.
    for (const date of ["2026-06-10", "2026-07-10", "2026-08-10", "2026-09-10"]) {
      expect(after[date], date).toEqual(before[date]);
    }
    expect(after["2026-06-10"]!.display).toBe("overdue");
    expect(after["2026-09-10"]!.display).toBe("due_today");
    // The future one is regenerated at the new amount.
    expect(after["2026-10-10"]!.expectedAmount).toBe(taka(32_000));
    expect(after["2026-10-10"]!.id).not.toBe(before["2026-10-10"]!.id);
    expect((await getCommitments(ctx))[0]!.generateFrom).toBe("2026-09-11");
  });

  it("keeps an occurrence whose payment was deleted: it was once linked", async () => {
    const { ctx, id, draft, occurrences, before, bank } = await history();
    const paidEarly = ok(await payOccurrence(ctx, before["2026-10-10"]!.id, { accountId: bank }));
    ok(await deleteTransaction(ctx, paidEarly));

    ok(
      await editCommitment(
        ctx,
        id,
        draft({ anchorOn: d("2026-06-10"), expectedAmount: taka(32_000) }),
      ),
    );
    const after = await occurrences(id);
    expect(after["2026-10-10"]).toMatchObject({
      id: before["2026-10-10"]!.id,
      state: "pending",
      expectedAmount: taka(30_000),
      transactionId: paidEarly,
    });
  });

  it("moves no boundary and touches no occurrence on a name, category or account edit", async () => {
    const { ctx, id, draft, occurrences, before, cash, setup } = await history();
    ok(
      await editCommitment(
        ctx,
        id,
        draft({
          anchorOn: d("2026-06-10"),
          name: "Flat rent",
          categoryId: setup.category("Other"),
          expectedAccountId: cash,
        }),
      ),
    );
    const after = await occurrences(id);
    expect(Object.values(after).map((o) => [o.id, o.expectedAmount, o.state])).toEqual(
      Object.values(before).map((o) => [o.id, o.expectedAmount, o.state]),
    );
    expect((await getCommitments(ctx))[0]).toMatchObject({
      name: "Flat rent",
      expectedAccountId: cash,
      generateFrom: "2026-06-10",
    });
  });

  it("never moves the boundary backwards", async () => {
    const { ctx, id, draft, travel } = await history();
    ok(await editCommitment(ctx, id, draft({ anchorOn: d("2026-06-10"), endOn: d("2027-12-31") })));
    travel("2026-09-10");
    ok(await editCommitment(ctx, id, draft({ anchorOn: d("2026-01-10") })));
    expect((await getCommitments(ctx))[0]!.generateFrom).toBe("2026-09-11");
  });

  it("rejects an unknown commitment", async () => {
    const { ctx, draft } = await commitmentLedger();
    expect(errorCode(await editCommitment(ctx, "missing", draft()))).toBe("commitment_not_found");
  });
});

// ---------------------------------------------------------------------------
// Pay
// ---------------------------------------------------------------------------

describe("payOccurrence", () => {
  it("records exactly one real expense through the ledger and links it", async () => {
    const { ctx, create, occurrences, bank, housing, transactionCount, balanceOf } =
      await commitmentLedger();
    const id = await create();
    const rent = (await occurrences(id))["2026-09-01"]!;
    const before = { count: transactionCount(), bank: await balanceOf(bank) };

    const transactionId = ok(await payOccurrence(ctx, rent.id, { accountId: bank }));

    expect(transactionCount()).toBe(before.count + 1);
    const row = (await getTransactions(ctx)).find((t) => t.id === transactionId)!;
    expect(row).toMatchObject({
      type: "expense",
      amountMinor: -taka(30_000),
      accountId: bank,
      categoryId: housing,
      description: "Rent",
      occurredOn: "2026-09-22",
    });
    expect(await balanceOf(bank)).toBe(before.bank - taka(30_000));
    expect((await occurrences(id))["2026-09-01"]).toMatchObject({ state: "paid", transactionId });
  });

  it("uses the amount and date the person states", async () => {
    const { ctx, create, occurrences, cash } = await commitmentLedger();
    const id = await create();
    const rent = (await occurrences(id))["2026-10-01"]!;
    const transactionId = ok(
      await payOccurrence(ctx, rent.id, {
        accountId: cash,
        amount: taka(2_500),
        occurredOn: d("2026-09-15"),
      }),
    );
    expect((await getTransactions(ctx)).find((t) => t.id === transactionId)).toMatchObject({
      amountMinor: -taka(2_500),
      accountId: cash,
      occurredOn: "2026-09-15",
    });
  });

  it("cannot pay twice", async () => {
    const { ctx, create, occurrences, bank, transactionCount } = await commitmentLedger();
    const rent = (await occurrences(await create()))["2026-09-01"]!;
    ok(await payOccurrence(ctx, rent.id, { accountId: bank }));
    const count = transactionCount();
    expect(errorCode(await payOccurrence(ctx, rent.id, { accountId: bank }))).toBe(
      "occurrence_paid",
    );
    expect(transactionCount()).toBe(count);
  });

  it("rolls back completely when the ledger rejects the expense", async () => {
    const { ctx, create, occurrences, bank, setup, transactionCount, nextSequence } =
      await commitmentLedger();
    const id = await create();
    const rent = (await occurrences(id))["2026-09-01"]!;
    const archived = await setup.account("Old wallet", "cash", "2026-01-01");
    ok(await archiveAccount(ctx, archived));
    const before = { count: transactionCount(), sequence: nextSequence() };

    const attempts = [
      { accountId: bank, occurredOn: d("2026-09-23") },
      { accountId: bank, occurredOn: d("2025-12-31") },
      { accountId: archived },
      { accountId: "missing" },
    ];
    expect(
      await Promise.all(attempts.map(async (a) => errorCode(await payOccurrence(ctx, rent.id, a)))),
    ).toEqual(["future_date", "before_opened_on", "account_archived", "account_not_found"]);

    expect(transactionCount()).toBe(before.count);
    expect(nextSequence()).toBe(before.sequence);
    expect((await occurrences(id))["2026-09-01"]).toMatchObject({
      state: "pending",
      transactionId: null,
    });
  });

  it("pays into the commitment's own category even once it is archived", async () => {
    const { ctx, create, occurrences, bank, housing } = await commitmentLedger();
    const rent = (await occurrences(await create()))["2026-09-01"]!;
    ok(await archiveCategory(ctx, housing));
    ok(await payOccurrence(ctx, rent.id, { accountId: bank }));
    const paid = (await occurrences(rent.commitmentId))["2026-09-01"]!;
    expect(paid.state).toBe("paid");
  });

  it("rejects an unknown or skipped occurrence", async () => {
    const { ctx, create, occurrences, bank } = await commitmentLedger();
    const rent = (await occurrences(await create()))["2026-09-01"]!;
    expect(errorCode(await payOccurrence(ctx, "missing", { accountId: bank }))).toBe(
      "occurrence_not_found",
    );
    ok(await skipOccurrence(ctx, rent.id));
    expect(errorCode(await payOccurrence(ctx, rent.id, { accountId: bank }))).toBe(
      "occurrence_skipped",
    );
  });

  it("maps a ledger rejection to the Pay form field", async () => {
    const { ctx, create, occurrences, bank } = await commitmentLedger();
    const rent = (await occurrences(await create()))["2026-09-01"]!;
    expect(
      await payCommand(ctx, rent.id, { accountId: bank, occurredOn: "2026-09-30" }),
    ).toMatchObject({ ok: false, fieldErrors: { occurredOn: expect.any(String) } });
    expect(await payCommand(ctx, rent.id, { accountId: bank, amount: "0" })).toMatchObject({
      ok: false,
      fieldErrors: { amount: expect.any(String) },
    });
    expect((await payCommand(ctx, rent.id, { accountId: bank, amount: "" })).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Skip
// ---------------------------------------------------------------------------

describe("skipOccurrence", () => {
  it("skips a pending occurrence, once", async () => {
    const { ctx, create, occurrences } = await commitmentLedger();
    const id = await create();
    const rent = (await occurrences(id))["2026-09-01"]!;
    ok(await skipOccurrence(ctx, rent.id));
    expect((await occurrences(id))["2026-09-01"]).toMatchObject({
      state: "skipped",
      display: "skipped",
    });
    expect(errorCode(await skipOccurrence(ctx, rent.id))).toBe("occurrence_skipped");
  });

  it("cannot skip a paid occurrence", async () => {
    const { ctx, create, occurrences, bank } = await commitmentLedger();
    const rent = (await occurrences(await create()))["2026-09-01"]!;
    ok(await payOccurrence(ctx, rent.id, { accountId: bank }));
    expect(errorCode(await skipOccurrence(ctx, rent.id))).toBe("occurrence_paid");
  });
});

// ---------------------------------------------------------------------------
// The ledger changes under a paid occurrence
// ---------------------------------------------------------------------------

describe("derived state as the linked transaction changes", () => {
  async function paidRent() {
    const env = await commitmentLedger();
    const id = await env.create();
    const rent = (await env.occurrences(id))["2026-09-01"]!;
    const paid = ok(await payOccurrence(env.ctx, rent.id, { accountId: env.bank }));
    const read = async () => (await env.occurrences(id))["2026-09-01"]!;
    return { ...env, id, rent, paid, read };
  }

  it("deleted → pending and overdue, keeping the pointer; restored → paid", async () => {
    const { ctx, paid, read } = await paidRent();
    ok(await deleteTransaction(ctx, paid));
    expect(await read()).toMatchObject({
      state: "pending",
      display: "overdue",
      transactionId: paid,
    });
    ok(await restoreTransaction(ctx, paid));
    expect(await read()).toMatchObject({ state: "paid", transactionId: paid });
  });

  it("edited into a transfer → pending, keeping the pointer", async () => {
    const { ctx, paid, read, bank, cash } = await paidRent();
    ok(
      await updateTransaction(ctx, paid, {
        type: "transfer",
        amount: taka(30_000),
        accountId: bank,
        counterAccountId: cash,
        occurredOn: d("2026-09-22"),
      }),
    );
    expect(await read()).toMatchObject({ state: "pending", transactionId: paid });
  });

  it("Skip after a dead link clears the pointer and leaves the ledger row untouched", async () => {
    const { ctx, paid, read, rent } = await paidRent();
    ok(await deleteTransaction(ctx, paid));
    const ledgerRow = () =>
      handle!.sqlite.prepare("SELECT * FROM transactions WHERE id = ?").get(paid);
    const before = ledgerRow();

    ok(await skipOccurrence(ctx, rent.id));
    expect(await read()).toMatchObject({ state: "skipped", transactionId: null });
    expect(ledgerRow()).toEqual(before);
  });

  it("Pay after a dead link records new evidence and re-points to it", async () => {
    const { ctx, paid, read, rent, bank, transactionCount } = await paidRent();
    ok(await deleteTransaction(ctx, paid));
    const count = transactionCount();

    const again = ok(await payOccurrence(ctx, rent.id, { accountId: bank }));
    expect(again).not.toBe(paid);
    expect(transactionCount()).toBe(count + 1);
    expect(await read()).toMatchObject({ state: "paid", transactionId: again });
    // The old payment stays deleted in the ledger; restoring it pays nothing.
    ok(await restoreTransaction(ctx, paid));
    expect(await read()).toMatchObject({ state: "paid", transactionId: again });
  });
});

// ---------------------------------------------------------------------------
// Owner isolation
// ---------------------------------------------------------------------------

describe("owner isolation", () => {
  it("treats another owner's commitment, occurrence, category and account as not found", async () => {
    const mine = await commitmentLedger();
    const id = await mine.create();
    const rent = (await mine.occurrences(id))["2026-09-01"]!;

    const theirs = ok(
      await createOwner(
        { db: mine.ctx.db, ids: mine.ctx.ids, now: mine.ctx.now },
        { name: "Other", baseCurrency: "BDT", timeZone: "Asia/Dhaka" },
      ),
    );
    const other: ServiceContext = { ...mine.ctx, ownerId: theirs };
    const theirCategory = (await getCategories(other)).find((c) => c.name === "Housing")!.id;
    const theirCash = ok(
      await createAccount(other, { name: "Cash", type: "cash", openedOn: d("2026-01-01") }),
    );

    // They cannot see, edit, pay or skip mine…
    expect(await getOccurrences(other)).toEqual([]);
    expect(await getCommitments(other)).toEqual([]);
    expect(
      errorCode(await editCommitment(other, id, mine.draft({ categoryId: theirCategory }))),
    ).toBe("commitment_not_found");
    expect(errorCode(await payOccurrence(other, rent.id, { accountId: theirCash }))).toBe(
      "occurrence_not_found",
    );
    expect(errorCode(await skipOccurrence(other, rent.id))).toBe("occurrence_not_found");

    // …nor build theirs on my category or account, and I cannot pay from theirs.
    const borrowed = (patch: Partial<CommitmentDraft>) =>
      createCommitment(other, {
        ...mine.draft({ categoryId: theirCategory, expectedAccountId: null }),
        ...patch,
      });
    expect(errorCode(await borrowed({ categoryId: mine.housing }))).toBe("category_not_found");
    expect(errorCode(await borrowed({ expectedAccountId: mine.bank }))).toBe("account_not_found");
    expect(errorCode(await payOccurrence(mine.ctx, rent.id, { accountId: theirCash }))).toBe(
      "account_not_found",
    );
    expect((await mine.occurrences(id))["2026-09-01"]).toMatchObject({ state: "pending" });
  });
});

// ---------------------------------------------------------------------------
// Reference protection
// ---------------------------------------------------------------------------

describe("deleting what a commitment refers to", () => {
  it("refuses to delete an account used only as a commitment's expected account", async () => {
    const { ctx, create, setup } = await commitmentLedger();
    const wallet = await setup.account("Wallet", "cash", "2026-01-01");
    await create({ expectedAccountId: wallet });
    expect((await getAccountReferenceCounts(ctx)).get(wallet)).toBe(1);
    expect(errorCode(await deleteAccount(ctx, wallet))).toBe("account_in_use");
  });

  it("refuses to delete a category used only by a commitment", async () => {
    const { ctx, create, setup } = await commitmentLedger();
    const other = setup.category("Other");
    await create({ categoryId: other });
    expect((await getCategoryReferenceCounts(ctx)).get(other)).toBe(1);
    expect(errorCode(await deleteCategory(ctx, other))).toBe("category_in_use");
  });

  it("still deletes an unreferenced account and category", async () => {
    const { ctx, setup } = await commitmentLedger();
    const wallet = await setup.account("Wallet", "cash", "2026-01-01");
    ok(await deleteAccount(ctx, wallet));
    ok(await deleteCategory(ctx, setup.category("Other")));
  });
});
