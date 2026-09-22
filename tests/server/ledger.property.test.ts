import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { transactions } from "@/db/schema";
import { addDays, type DateRange } from "@/domain/calendar-date";
import { compareLedgerOrder } from "@/domain/ledger/ordering";
import type { TransactionDraft } from "@/domain/ledger/transactions";
import { money } from "@/domain/money";
import {
  deleteTransaction,
  getAccountBalances,
  getPosition,
  getTotalSpending,
  getTransactions,
  recordTransaction,
  recordTransferWithFee,
  restoreTransaction,
  updateTransaction,
} from "@/server/services/ledger-service";

import { d, setupLedger } from "../support/ledger";

/**
 * Model-based property test. Random command sequences run through the real
 * services on a real database, and in parallel through a tiny independent
 * reference model (plain arithmetic, no domain code). Afterwards the ledger's
 * derived state must match the model and satisfy every structural invariant.
 */
const OPENED = d("2026-08-01");
const ALL_TIME: DateRange = { start: OPENED, end: d("2026-09-23") };

type Kind = "income" | "expense" | "refund" | "transfer";

const move = fc.record({
  type: fc.constantFrom<Kind>("income", "expense", "refund", "transfer"),
  amount: fc.integer({ min: 1, max: 10_000_000 }),
  from: fc.integer({ min: 0, max: 3 }),
  to: fc.integer({ min: 0, max: 3 }),
  day: fc.integer({ min: 0, max: 52 }), // Aug 1 … Sep 22
});

const command = fc.oneof(
  move.map((m) => ({ kind: "record" as const, ...m })),
  fc
    .record({ move, fee: fc.integer({ min: 1, max: 100_000 }) })
    .map(({ move: m, fee }) => ({ kind: "fee" as const, ...m, fee })),
  fc
    .record({ target: fc.nat(), move })
    .map(({ target, move: m }) => ({ kind: "edit" as const, target, ...m })),
  fc.nat().map((target) => ({ kind: "delete" as const, target })),
  fc.nat().map((target) => ({ kind: "restore" as const, target })),
);

interface ModelRow {
  type: Kind;
  amount: number; // signed effect on account
  account: number;
  counter: number | null;
  deleted: boolean;
  group: string | null;
}

describe("ledger invariants under random command sequences", () => {
  it("balances, transfers, net worth, spending and sequences always agree with the reference model", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(command, { maxLength: 25 }), async (commands) => {
        const { handle, ctx, account, category } = await setupLedger();
        try {
          const openings = [5_000_000, 0, 100_000, -500_000];
          const accounts = [
            await account("Bank", "bank", OPENED, openings[0]! / 100),
            await account("Cash", "cash", OPENED, openings[1]! / 100),
            await account("Wallet", "mobile_wallet", OPENED, openings[2]! / 100),
            await account("Visa", "credit_card", OPENED, openings[3]! / 100),
          ];
          const other = category("Other");
          const salary = category("Salary");
          const model = new Map<string, ModelRow>();
          const created: string[] = [];

          const draftFor = (m: {
            type: Kind;
            amount: number;
            from: number;
            to: number;
            day: number;
          }): TransactionDraft => {
            const common = {
              amount: money(m.amount),
              accountId: accounts[m.from]!,
              occurredOn: addDays(OPENED, m.day),
            };
            switch (m.type) {
              case "income":
                return { ...common, type: "income", categoryId: salary };
              case "expense":
                return { ...common, type: "expense", categoryId: other };
              case "refund":
                return { ...common, type: "refund", categoryId: other };
              case "transfer":
                return { ...common, type: "transfer", counterAccountId: accounts[m.to]! };
            }
          };
          const modelRow = (m: {
            type: Kind;
            amount: number;
            from: number;
            to: number;
          }): Omit<ModelRow, "deleted" | "group"> => ({
            type: m.type,
            amount: m.type === "expense" || m.type === "transfer" ? -m.amount : m.amount,
            account: m.from,
            counter: m.type === "transfer" ? m.to : null,
          });
          const groupRows = (id: string) => {
            const g = model.get(id)!.group;
            return g ? [...model.entries()].filter(([, r]) => r.group === g).map(([i]) => i) : [id];
          };

          for (const c of commands) {
            const selfTransfer = "type" in c && c.type === "transfer" && c.from === c.to;
            if (c.kind === "record") {
              const result = await recordTransaction(ctx, draftFor(c));
              expect(result.ok).toBe(!selfTransfer);
              if (result.ok) {
                model.set(result.value, { ...modelRow(c), deleted: false, group: null });
                created.push(result.value);
              }
            } else if (c.kind === "fee") {
              const result = await recordTransferWithFee(ctx, {
                fromAccountId: accounts[c.from]!,
                toAccountId: accounts[c.to]!,
                amount: money(c.amount),
                fee: money(c.fee),
                feeCategoryId: other,
                occurredOn: addDays(OPENED, c.day),
              });
              expect(result.ok).toBe(c.from !== c.to);
              if (result.ok) {
                const group = result.value.transferId;
                model.set(result.value.transferId, {
                  type: "transfer",
                  amount: -c.amount,
                  account: c.from,
                  counter: c.to,
                  deleted: false,
                  group,
                });
                model.set(result.value.feeId, {
                  type: "expense",
                  amount: -c.fee,
                  account: c.from,
                  counter: null,
                  deleted: false,
                  group,
                });
                created.push(result.value.transferId, result.value.feeId);
              }
            } else if (created.length > 0) {
              const id = created[c.target % created.length]!;
              const row = model.get(id)!;
              if (c.kind === "edit") {
                const result = await updateTransaction(ctx, id, draftFor(c));
                expect(result.ok).toBe(!row.deleted && !selfTransfer);
                if (result.ok) model.set(id, { ...row, ...modelRow(c) });
              } else if (c.kind === "delete") {
                const result = await deleteTransaction(ctx, id);
                expect(result.ok).toBe(!row.deleted);
                if (result.ok) for (const i of groupRows(id)) model.get(i)!.deleted = true;
              } else {
                const result = await restoreTransaction(ctx, id);
                expect(result.ok).toBe(row.deleted);
                if (result.ok) for (const i of groupRows(id)) model.get(i)!.deleted = false;
              }
            }
          }

          // 1. Every balance matches the reference model.
          const expected = [...openings];
          for (const r of model.values()) {
            if (r.deleted) continue;
            expected[r.account]! += r.amount;
            if (r.counter !== null) expected[r.counter]! -= r.amount;
          }
          const balances = await getAccountBalances(ctx);
          accounts.forEach((id, i) => {
            expect(balances.find((b) => b.accountId === id)!.balance).toBe(expected[i]);
          });

          // 2. Transfers net to zero across all entries.
          const transferSum = handle.sqlite
            .prepare(
              "SELECT coalesce(sum(delta_minor), 0) AS s FROM account_entries WHERE type = 'transfer'",
            )
            .get() as { s: number };
          expect(transferSum.s).toBe(0);

          // 3. Net worth = Σ balances = openings + Σ non-transfer effects.
          const position = await getPosition(ctx);
          expect(position.netWorth).toBe(expected.reduce((a, b) => a + b, 0));
          const nonTransfer = [...model.values()].filter(
            (r) => !r.deleted && r.type !== "transfer",
          );
          expect(position.netWorth).toBe(
            openings.reduce((a, b) => a + b, 0) + nonTransfer.reduce((a, r) => a + r.amount, 0),
          );
          expect(position.assets - position.liabilities).toBe(position.netWorth);

          // 4. Spending = −Σ(expense + refund); transfers and openings never count.
          const spending = nonTransfer.filter((r) => r.type === "expense" || r.type === "refund");
          expect(await getTotalSpending(ctx, ALL_TIME)).toBe(
            0 - spending.reduce((a, r) => a + r.amount, 0),
          );

          // 5. Sequences: unique, gapless from 1 (rejected writes consumed none),
          //    strictly increasing in recording order, and immutable under edits.
          const stored = ctx.db
            .select({ id: transactions.id, sequence: transactions.sequence })
            .from(transactions)
            .all();
          const sequences = stored.map((r) => r.sequence).sort((a, b) => a - b);
          expect(sequences).toEqual(sequences.map((_, i) => i + 1));
          const byId = new Map(stored.map((r) => [r.id, r.sequence]));
          const createdSequences = created.map((id) => byId.get(id)!);
          expect([...createdSequences].sort((a, b) => a - b)).toEqual(createdSequences);

          // 6. Lists come back in business order (occurred_on, sequence) — never by id.
          const listed = await getTransactions(ctx);
          expect([...listed].sort((a, b) => compareLedgerOrder(a as never, b as never))).toEqual(
            listed,
          );
          expect(listed.every((r) => !model.get(r.id)?.deleted)).toBe(true);
        } finally {
          handle.close();
        }
      }),
      { numRuns: 60 },
    );
  }, 60_000);
});
