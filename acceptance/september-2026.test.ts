import { afterAll, describe, expect, it } from "vitest";

import { likeForLikeWindows, type CalendarDate } from "@/domain/calendar-date";
import { formatPercent, formatShare } from "@/domain/ledger/analytics";
import { fromMajor, subtract, sum, type Money } from "@/domain/money";
import { getOccurrences } from "@/server/services/commitment-service";
import {
  deleteTransaction,
  getAccountBalances,
  getIncome,
  getPosition,
  getSavingsRate,
  getSpendingByCategory,
  getTotalSpending,
  getTransactions,
  updateTransaction,
} from "@/server/services/ledger-service";

import { getMonthlyCashFlow } from "@/server/services/analysis-service";
import { getAvailable, type AvailableView } from "@/server/services/available-service";
import { getItems, reserve } from "@/server/services/protected-money-service";
import { getAccountVerifications } from "@/server/services/reconciliation-service";

import { ACCEPTANCE_CATALOGUE } from "./catalogue";
import { buildSeptember2026, TODAY, type Scenario } from "./fixtures/september-2026";

/**
 * Mandatory acceptance scenario (docs/acceptance-scenarios.md), run with the
 * clock fixed at 2026-09-22 (Asia/Dhaka) against a real migrated database.
 *
 * Every catalogue entry is either implemented below or still a todo. Each
 * roadmap stage turns its entries green; a failing number blocks a release.
 */
const taka = fromMajor;
const { current: SEP_1_22, previous: AUG_1_22 } = likeForLikeWindows(TODAY);

// ---------------------------------------------------------------------------
// Scenario instances (built once, lazily)
// ---------------------------------------------------------------------------

const built: Scenario[] = [];
const once = <T>(build: () => Promise<T>) => {
  let value: Promise<T> | undefined;
  return () => (value ??= build());
};
const base = once(async () => {
  const s = await buildSeptember2026();
  built.push(s);
  return s;
});
const m3 = once(async () => {
  const s = await buildSeptember2026("m3-card-payment-as-expense");
  built.push(s);
  return s;
});
// Its own instance: correcting the row edits it in place, so sharing m3()
// would make every assertion about the *uncorrected* state depend on whether
// this one had run yet.
const m3Corrected = once(async () => {
  const s = await buildSeptember2026("m3-card-payment-as-expense");
  built.push(s);
  const before = (await getTransactions(s.ctx)).find((r) => r.id === s.rows.R5)!;
  const result = await updateTransaction(s.ctx, s.rows.R5!, {
    type: "transfer",
    amount: taka(12_000),
    accountId: s.accounts.bank,
    counterAccountId: s.accounts.visa,
    occurredOn: before.occurredOn as CalendarDate,
  });
  expect(result.ok).toBe(true);
  return { s, before };
});
/** M2: the Sep 15 lunch was really paid from bKash, not Cash. */
const m2 = once(async () => {
  const s = await buildSeptember2026();
  built.push(s);
  const result = await updateTransaction(s.ctx, s.rows.R8!, {
    type: "expense",
    amount: taka(450),
    accountId: s.accounts.bkash,
    categoryId: s.category("Food & Dining"),
    occurredOn: "2026-09-15" as CalendarDate,
  });
  expect(result.ok).toBe(true);
  return s;
});
/** M1: the Sep 2 rent payment (row 2) is deleted. */
const m1 = once(async () => {
  const s = await buildSeptember2026();
  built.push(s);
  const result = await deleteTransaction(s.ctx, s.rows.R2!);
  expect(result.ok).toBe(true);
  return s;
});
/** A-51: its own instance, so a write that wrongly succeeded could not leak into other assertions. */
const a51 = once(async () => {
  const s = await buildSeptember2026();
  built.push(s);
  return s;
});
afterAll(() => built.forEach((s) => s.handle.close()));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function balances(s: Scenario, asOf?: CalendarDate) {
  const rows = await getAccountBalances(s.ctx, asOf);
  const of = (id: string) => rows.find((r) => r.accountId === id)!.balance;
  return {
    bank: of(s.accounts.bank),
    cash: of(s.accounts.cash),
    bkash: of(s.accounts.bkash),
    savings: of(s.accounts.savings),
    visa: of(s.accounts.visa),
  };
}

/** Spending per category name over a window. */
async function spendingByName(s: Scenario, range = SEP_1_22): Promise<Record<string, Money>> {
  const byId = await getSpendingByCategory(s.ctx, range);
  const names = new Map(
    [
      "Housing",
      "Health",
      "Groceries",
      "Shopping",
      "Food & Dining",
      "Fees & Charges",
      "Utilities",
      "Other",
    ].map((n) => [s.category(n), n]),
  );
  return Object.fromEntries([...byId].map(([id, amount]) => [names.get(id) ?? id, amount]));
}

/** The Available bridge's terms, without its evidence lines. */
const bridgeTerms = (view: AvailableView) => ({
  includedAssetBalances: view.includedAssetBalances,
  liabilityBalances: view.liabilityBalances,
  balancesInScope: view.balancesInScope,
  commitmentsDue: view.commitmentsDue,
  coveredEarmarks: view.coveredEarmarks,
  available: view.available,
});

/** Occurrences keyed "Name Mon D" (e.g. "Rent 2026-09-01"), as read on 2026-09-22. */
async function occurrencesByKey(s: Scenario) {
  return Object.fromEntries((await getOccurrences(s.ctx)).map((o) => [`${o.name} ${o.dueOn}`, o]));
}

/** The month-over-month explanation shown for September to date (Sep 1–22 vs Aug 1–22). */
async function monthOverMonth(s: Scenario) {
  const { change } = await getMonthlyCashFlow(s.ctx);
  expect(change?.comparison).toEqual({ month: "2026-08", kind: "same_days", range: AUG_1_22 });
  const explanation = change!.explanation;
  const lines = [...explanation.increases, ...explanation.offsets, ...explanation.unchanged];
  const byName = Object.fromEntries(lines.map((l) => [l.name, l]));
  return { explanation, lines, byName };
}

// ---------------------------------------------------------------------------
// Implemented assertions, keyed "ID" or "ID (part)"
// ---------------------------------------------------------------------------

const implemented: Record<string, () => Promise<void>> = {
  "A-01": async () => {
    expect(await balances(await base(), "2026-08-31" as CalendarDate)).toEqual({
      bank: taka(85_000),
      cash: taka(3_000),
      bkash: taka(6_000),
      savings: taka(120_000),
      visa: taka(-12_000),
    });
  },

  "A-02": async () => {
    const b = await balances(await base());
    expect({ bank: b.bank, bkash: b.bkash, savings: b.savings, visa: b.visa }).toEqual({
      bank: taka(133_000),
      bkash: taka(8_963),
      savings: taka(90_000),
      visa: taka(-6_000),
    });
  },

  "A-03": async () => {
    const s = await base();
    expect(await spendingByName(s)).toEqual({
      Housing: taka(30_000),
      Health: taka(30_000),
      Groceries: taka(4_200),
      Shopping: taka(1_800),
      "Food & Dining": taka(450),
      "Fees & Charges": taka(37),
    });
    expect(await getTotalSpending(s.ctx, SEP_1_22)).toBe(taka(66_487));
  },

  "A-04": async () => {
    expect(await getIncome((await base()).ctx, SEP_1_22)).toBe(taka(95_000));
  },

  "A-05": async () => {
    const rate = await getSavingsRate((await base()).ctx, SEP_1_22);
    expect(rate).toEqual({ numerator: taka(28_513), denominator: taka(95_000) });
    expect(formatPercent(rate!)).toBe("30.0%");
  },

  "A-06": async () => {
    const s = await base();
    const transferIds = [s.rows.R5, s.rows.R6, s.rows.R7];
    const entries = s.handle.sqlite
      .prepare(
        `SELECT transaction_id, sum(delta_minor) AS net, count(*) AS legs
         FROM account_entries WHERE transaction_id IN (?, ?, ?) GROUP BY transaction_id`,
      )
      .all(...transferIds) as { net: number; legs: number }[];
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.net === 0 && e.legs === 2)).toBe(true);
    const all = s.handle.sqlite
      .prepare("SELECT sum(delta_minor) AS s FROM account_entries WHERE type = 'transfer'")
      .get() as { s: number };
    expect(all.s).toBe(0);
    // Transfers carry no category, so they cannot appear in spending or income.
    const rows = (await getTransactions(s.ctx)).filter((r) => transferIds.includes(r.id));
    expect(rows.map((r) => [r.type, r.categoryId])).toEqual([
      ["transfer", null],
      ["transfer", null],
      ["transfer", null],
    ]);
    expect(await getTotalSpending(s.ctx, SEP_1_22)).toBe(taka(66_487));
    expect(await getIncome(s.ctx, SEP_1_22)).toBe(taka(95_000));
  },

  "A-07": async () => {
    const s = await base();
    expect(AUG_1_22).toEqual({ start: "2026-08-01", end: "2026-08-23" });
    expect(await spendingByName(s, AUG_1_22)).toEqual({
      Housing: taka(30_000),
      Groceries: taka(5_000),
      Shopping: taka(3_800),
      "Food & Dining": taka(1_200),
      "Fees & Charges": taka(37),
    });
    expect(await getTotalSpending(s.ctx, AUG_1_22)).toBe(taka(40_037));
  },

  "A-08": async () => {
    const s = await base();
    const spending = await getTotalSpending(s.ctx, SEP_1_22);
    const income = await getIncome(s.ctx, SEP_1_22);
    expect(spending).not.toBe(taka(78_487));
    expect(income).not.toBe(taka(96_200));
    // The naive figures are exactly "correct + card payment" and "income + refund".
    expect(spending + taka(12_000)).toBe(taka(78_487));
    expect(income + taka(1_200)).toBe(taka(96_200));
  },

  "A-20": async () => {
    const { lines } = await monthOverMonth(await base());
    expect(Object.fromEntries(lines.map((l) => [l.name, l.change]))).toEqual({
      Health: taka(30_000),
      Shopping: taka(-2_000),
      Groceries: taka(-800),
      "Food & Dining": taka(-750),
      Housing: taka(0),
      "Fees & Charges": taka(0),
    });
  },

  "A-21": async () => {
    const { explanation } = await monthOverMonth(await base());
    expect(explanation).toMatchObject({
      currentTotal: taka(66_487),
      previousTotal: taka(40_037),
      net: taka(26_450),
      grossIncreases: taka(30_000),
      grossDecreases: taka(3_550),
    });
  },

  "A-22": async () => {
    const { explanation } = await monthOverMonth(await base());
    expect(explanation.increases.map((l) => [l.name, l.shareOfIncreases])).toEqual([
      ["Health", { numerator: taka(30_000), denominator: taka(30_000) }],
    ]);
    expect(formatShare(explanation.increases[0]!.shareOfIncreases!)).toBe("100%");
    expect(explanation.offsets.map((l) => [l.name, l.change, l.shareOfIncreases])).toEqual([
      ["Shopping", taka(-2_000), null],
      ["Groceries", taka(-800), null],
      ["Food & Dining", taka(-750), null],
    ]);
    // Over the net change Health would be 113%: why gross increases is the denominator.
    expect(formatShare({ numerator: taka(30_000), denominator: explanation.net })).toBe("113%");
  },

  "A-23": async () => {
    const { byName, explanation } = await monthOverMonth(await base());
    for (const name of ["Health", "Shopping", "Groceries", "Food & Dining"]) {
      expect(byName[name]!.material, name).toBe(true);
    }
    expect(byName.Housing!.material).toBe(false);
    expect(byName["Fees & Charges"]!.material).toBe(false);
    expect(explanation.smallerChanges).toEqual({ count: 0, net: taka(0) });
  },

  "A-30": async () => {
    const s = await base();
    const occurrences = await getOccurrences(s.ctx);
    const byState = (state: string) =>
      occurrences.filter((o) => o.state === state).map((o) => `${o.name} ${o.dueOn}`);

    expect(byState("paid")).toEqual(["Rent 2026-08-01", "Internet 2026-08-25", "Rent 2026-09-01"]);
    expect(byState("pending")).toEqual([
      "Internet 2026-09-25",
      "Rent 2026-10-01",
      "Streaming 2026-10-03",
      "Internet 2026-10-25",
      "Rent 2026-11-01",
      "Streaming 2026-11-03",
    ]);
    expect(byState("skipped")).toEqual([]);
    // Materialised through today + 60 = Nov 21, and no Streaming before Oct 3.
    expect(occurrences.every((o) => o.dueOn <= "2026-11-21")).toBe(true);
    expect(occurrences.some((o) => o.name === "Streaming" && o.dueOn < "2026-10-03")).toBe(false);

    // Each paid occurrence is linked to the scenario row that paid it.
    const byKey = await occurrencesByKey(s);
    expect(byKey["Rent 2026-08-01"]!.transactionId).toBe(s.rows.P2);
    expect(byKey["Internet 2026-08-25"]!.transactionId).toBe(s.rows.P7);
    expect(byKey["Rent 2026-09-01"]!.transactionId).toBe(s.rows.R2);
  },

  "A-31": async () => {
    const pending = (await getOccurrences((await base()).ctx)).filter(
      (o) => o.state === "pending" && o.dueOn <= "2026-10-22",
    );
    expect(pending.map((o) => [o.name, o.expectedAmount])).toEqual([
      ["Internet", taka(1_500)],
      ["Rent", taka(30_000)],
      ["Streaming", taka(700)],
    ]);
    expect(sum(pending.map((o) => o.expectedAmount))).toBe(taka(32_200));
  },

  "A-32": async () => {
    const s = await base();
    const first = await getOccurrences(s.ctx);
    const second = await getOccurrences(s.ctx);
    expect(second).toEqual(first);
    const stored = s.handle.sqlite
      .prepare(
        "SELECT count(*) AS n, count(DISTINCT commitment_id || due_on) AS keys FROM commitment_occurrences",
      )
      .get() as { n: number; keys: number };
    expect(stored).toEqual({ n: 9, keys: 9 });
  },

  "M1-1": async () => {
    const rent = (await occurrencesByKey(await m1()))["Rent 2026-09-01"]!;
    expect(rent).toMatchObject({ state: "pending", display: "overdue" });
    // The pointer to the deleted payment is kept: the occurrence was paid once.
    expect(rent.transactionId).not.toBeNull();
  },

  "M1-2": async () => {
    const s = await m1();
    expect((await balances(s)).bank).toBe(taka(163_000));
    expect((await getPosition(s.ctx)).netWorth).toBe(taka(260_163));
    expect(await getTotalSpending(s.ctx, SEP_1_22)).toBe(taka(36_487));
  },

  "M3-1 (ledger)": async () => {
    const s = await m3();
    const b = await balances(s);
    expect({ bank: b.bank, visa: b.visa }).toEqual({ bank: taka(133_000), visa: taka(-18_000) });
    expect(await getTotalSpending(s.ctx, SEP_1_22)).toBe(taka(78_487));
    expect((await spendingByName(s)).Other).toBe(taka(12_000));
  },

  "A-10": async () => {
    const s = await base();
    const adjustment = (await getTransactions(s.ctx)).find((r) => r.id === s.rows.R10)!;
    expect(adjustment).toMatchObject({
      type: "adjustment",
      occurredOn: "2026-09-20",
      amountMinor: taka(-350),
      accountId: s.accounts.cash,
      categoryId: null,
      counterAccountId: null,
    });
    expect((await balances(s)).cash).toBe(taka(4_200));
  },

  "A-11": async () => {
    const position = await getPosition((await base()).ctx);
    expect(position).toMatchObject({
      netWorth: taka(230_163),
      assets: taka(236_163),
      liabilities: taka(6_000),
    });
  },

  "A-12": async () => {
    const s = await base();
    // The adjustment moved Cash by −350 and changed no analytic total.
    expect(await getTotalSpending(s.ctx, SEP_1_22)).toBe(taka(66_487));
    expect(await getIncome(s.ctx, SEP_1_22)).toBe(taka(95_000));
  },

  "A-14": async () => {
    const s = await base();
    const opening = await balances(s, "2026-08-31" as CalendarDate);
    const openingNetWorth = sum(Object.values(opening));
    const netWorth = (await getPosition(s.ctx)).netWorth;
    const income = await getIncome(s.ctx, SEP_1_22);
    const spending = await getTotalSpending(s.ctx, SEP_1_22);

    expect(openingNetWorth).toBe(taka(202_000));
    expect(netWorth).toBe(taka(230_163));
    expect(subtract(netWorth, openingNetWorth)).toBe(taka(28_163));
    expect(subtract(subtract(income, spending), taka(350))).toBe(taka(28_163));
  },

  "A-13": async () => {
    const s = await base();
    const status = (await getAccountVerifications(s.ctx, [s.accounts.cash])).get(s.accounts.cash)!;
    expect(status).toMatchObject({
      status: "verified",
      asOf: "2026-09-20",
      stated: taka(4_200),
      recorded: taka(4_200),
      drift: 0,
    });
  },

  "M2-1": async () => {
    const s = await m2();
    const status = (await getAccountVerifications(s.ctx, [s.accounts.cash])).get(s.accounts.cash)!;
    // Moving the lunch off Cash leaves Sep 20 deriving 4,650 against a stated 4,200.
    expect(status).toMatchObject({
      status: "changed",
      asOf: "2026-09-20",
      stated: taka(4_200),
      recorded: taka(4_650),
      drift: taka(450),
    });
  },

  "M2-2 (ledger)": async () => {
    const s = await m2();
    const b = await balances(s);
    expect({ cash: b.cash, bkash: b.bkash }).toEqual({
      cash: taka(4_650),
      bkash: taka(8_513),
    });
    expect((await getPosition(s.ctx)).netWorth).toBe(taka(230_163));
    expect(await getTotalSpending(s.ctx, SEP_1_22)).toBe(taka(66_487));
  },

  "M3-1 (net worth)": async () => {
    expect((await getPosition((await m3()).ctx)).netWorth).toBe(taka(218_163));
  },

  "M3-3 (net worth)": async () => {
    const { s } = await m3Corrected();
    expect((await getPosition(s.ctx)).netWorth).toBe(taka(230_163));
  },

  "M3-2": async () => {
    const { s, before } = await m3Corrected();
    const after = (await getTransactions(s.ctx)).find((r) => r.id === s.rows.R5)!;
    expect(after).toMatchObject({
      id: before.id,
      sequence: before.sequence,
      type: "transfer",
      categoryId: null,
      counterAccountId: s.accounts.visa,
    });
  },

  "M3-3 (ledger)": async () => {
    const { s } = await m3Corrected();
    expect((await balances(s)).visa).toBe(taka(-6_000));
    expect(await getTotalSpending(s.ctx, SEP_1_22)).toBe(taka(66_487));
  },

  "A-50": async () => {
    const s = await base();
    const laptop = (await getItems(s.ctx)).find((i) => i.id === s.items.laptop)!;
    expect(laptop.cover).toMatchObject({
      target: taka(150_000),
      reserved: taka(120_000),
      covered: taka(110_000),
      short: taka(10_000),
      stillNeeded: taka(40_000),
      targetReached: false,
    });
    expect(formatPercent(laptop.cover.progress!, 0)).toBe("73%");
    const byAccount = Object.fromEntries(
      laptop.earmarks.map((e) => [
        e.accountId,
        { reserved: e.reserved, covered: e.covered, short: e.short },
      ]),
    );
    expect(byAccount).toEqual({
      [s.accounts.savings]: { reserved: taka(100_000), covered: taka(90_000), short: taka(10_000) },
      [s.accounts.bank]: { reserved: taka(20_000), covered: taka(20_000), short: taka(0) },
    });
  },

  "A-51": async () => {
    const s = await a51();
    const count = () =>
      s.handle.sqlite
        .prepare(
          "SELECT (SELECT count(*) FROM earmark_entries) AS entries, (SELECT count(*) FROM earmarks) AS earmarks",
        )
        .get();
    const before = count();

    // Sep 22: Savings holds 90,000 and already has 100,000 set aside.
    const overBalance = await reserve(s.ctx, s.items.laptop, {
      accountId: s.accounts.savings,
      amount: taka(1_000),
    });
    const onLiability = await reserve(s.ctx, s.items.laptop, {
      accountId: s.accounts.visa,
      amount: taka(1_000),
    });

    expect(overBalance).toMatchObject({ ok: false, error: { code: "exceeds_balance" } });
    expect(onLiability).toMatchObject({ ok: false, error: { code: "account_not_asset" } });
    expect(count()).toEqual(before);
    expect(before).toEqual({ entries: 2, earmarks: 2 });
  },

  "A-60": async () => {
    const s = await base();
    const view = await getAvailable(s.ctx);
    expect(bridgeTerms(view)).toEqual({
      includedAssetBalances: taka(146_163),
      liabilityBalances: taka(-6_000),
      balancesInScope: taka(140_163),
      commitmentsDue: taka(32_200),
      coveredEarmarks: taka(20_000),
      available: taka(87_963),
    });
    // 133,000 + 8,963 + 4,200 (accounts in name order).
    expect(
      view.accounts
        .filter((a) => a.accountClass === "asset" && a.counted)
        .map((a) => [a.name, a.balance]),
    ).toEqual([
      ["Bank", taka(133_000)],
      ["bKash", taka(8_963)],
      ["Cash", taka(4_200)],
    ]);
    // Due on or before Oct 22; Internet Oct 25 and Rent Nov 1 fall outside.
    expect(view.horizonEnd).toBe("2026-10-22");
    expect(view.commitments.map((c) => [c.name, c.dueOn, c.expectedAmount])).toEqual([
      ["Internet", "2026-09-25", taka(1_500)],
      ["Rent", "2026-10-01", taka(30_000)],
      ["Streaming", "2026-10-03", taka(700)],
    ]);
    // Only the Bank earmark is deducted, at what Bank covers.
    expect(view.earmarks.filter((e) => e.deducted)).toMatchObject([
      { itemId: s.items.laptop, accountId: s.accounts.bank, covered: taka(20_000) },
    ]);
  },

  "A-61": async () => {
    const s = await base();
    const view = await getAvailable(s.ctx);
    // The Savings balance is outside the pool…
    expect(view.accounts.find((a) => a.accountId === s.accounts.savings)).toMatchObject({
      counted: false,
      balance: taka(90_000),
    });
    // …and so is the money set aside on it (Savings covers 90,000 of 100,000).
    expect(view.earmarks.find((e) => e.accountId === s.accounts.savings)).toMatchObject({
      covered: taka(90_000),
      deducted: false,
    });
    // No income term: the Oct 1 salary is not expected income, and every
    // subtracted line is an outflow commitment.
    expect(new Set(view.commitments.map((c) => c.name))).toEqual(
      new Set(["Internet", "Rent", "Streaming"]),
    );
    expect(view.available).toBe(
      subtract(subtract(view.balancesInScope, view.commitmentsDue), view.coveredEarmarks),
    );
    expect(view.available).toBe(taka(87_963));
  },

  "M1-3": async () => {
    const view = await getAvailable((await m1()).ctx);
    expect(bridgeTerms(view)).toEqual({
      includedAssetBalances: taka(176_163),
      liabilityBalances: taka(-6_000),
      balancesInScope: taka(170_163),
      commitmentsDue: taka(62_200),
      coveredEarmarks: taka(20_000),
      available: taka(87_963),
    });
    expect(view.commitments[0]).toMatchObject({
      name: "Rent",
      dueOn: "2026-09-01",
      expectedAmount: taka(30_000),
      display: "overdue",
    });
  },

  "M2-2 (Available)": async () => {
    const view = await getAvailable((await m2()).ctx);
    expect(view.includedAssetBalances).toBe(taka(146_163));
    expect(view.available).toBe(taka(87_963));
  },

  "M3-1 (Available)": async () => {
    const view = await getAvailable((await m3()).ctx);
    expect(bridgeTerms(view)).toMatchObject({
      includedAssetBalances: taka(146_163),
      liabilityBalances: taka(-18_000),
      available: taka(75_963),
    });
  },

  "M3-3 (Available)": async () => {
    const { s } = await m3Corrected();
    const view = await getAvailable(s.ctx);
    expect(view.liabilityBalances).toBe(taka(-6_000));
    expect(view.available).toBe(taka(87_963));
  },
};

// ---------------------------------------------------------------------------
// The suite: every catalogue entry is a test or a todo
// ---------------------------------------------------------------------------

const keyOf = (id: string, title: string) => {
  const part = title.match(/^\((ledger|net worth|Available)\)/)?.[1];
  return part ? `${id} (${part})` : id;
};

for (const { stage, assertions } of ACCEPTANCE_CATALOGUE) {
  describe(`Stage ${stage}`, () => {
    for (const { id, title } of assertions) {
      const run = implemented[keyOf(id, title)];
      if (run) it(`${id} ${title}`, run);
      else it.todo(`${id} ${title}`);
    }
  });
}

describe("catalogue coverage", () => {
  it("every implemented assertion exists in the catalogue", () => {
    const keys = new Set(
      ACCEPTANCE_CATALOGUE.flatMap((s) => s.assertions.map((a) => keyOf(a.id, a.title))),
    );
    expect(Object.keys(implemented).filter((k) => !keys.has(k))).toEqual([]);
  });
});
