import { afterAll, describe, expect, it } from "vitest";

import { likeForLikeWindows, type CalendarDate } from "@/domain/calendar-date";
import { formatPercent } from "@/domain/ledger/analytics";
import { fromMajor, type Money } from "@/domain/money";
import {
  getAccountBalances,
  getIncome,
  getSavingsRate,
  getSpendingByCategory,
  getTotalSpending,
  getTransactions,
  updateTransaction,
} from "@/server/services/ledger-service";

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
const m3Corrected = once(async () => {
  const s = await m3();
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
    // Cash is asserted in Stage 4 (it depends on the row-10 reconciliation).
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

  "M3-1 (ledger)": async () => {
    const s = await m3();
    const b = await balances(s);
    expect({ bank: b.bank, visa: b.visa }).toEqual({ bank: taka(133_000), visa: taka(-18_000) });
    expect(await getTotalSpending(s.ctx, SEP_1_22)).toBe(taka(78_487));
    expect((await spendingByName(s)).Other).toBe(taka(12_000));
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
