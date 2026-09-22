import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { shapeViolations, TRANSACTION_TYPES } from "@/domain/ledger/transactions";
import { money } from "@/domain/money";

import { freshDatabase } from "../support/database";

/**
 * Differential property: for any candidate row, the pure domain shape rule
 * (shapeViolations) accepts it  ⇔  SQLite's CHECK constraints accept it.
 * The two encodings of docs/domain-model.md §4.1 can therefore never drift.
 *
 * All referenced ids exist, so only the shape CHECKs can reject a row.
 */
const NOW = "2026-09-22T00:00:00.000Z";

function seededDatabase() {
  const h = freshDatabase();
  h.sqlite.exec(`
    INSERT INTO owners (id, name, base_currency, time_zone, created_at, updated_at)
      VALUES ('o', 'O', 'BDT', 'Asia/Dhaka', '${NOW}', '${NOW}');
    INSERT INTO accounts (id, owner_id, name, type, currency, included_in_available, opened_on, created_at, updated_at) VALUES
      ('bank', 'o', 'Bank', 'bank', 'BDT', 1, '2026-08-01', '${NOW}', '${NOW}'),
      ('cash', 'o', 'Cash', 'cash', 'BDT', 1, '2026-08-01', '${NOW}', '${NOW}');
    INSERT INTO categories (id, owner_id, name, kind, created_at, updated_at)
      VALUES ('shop', 'o', 'Shopping', 'expense', '${NOW}', '${NOW}');
    INSERT INTO transactions (id, owner_id, sequence, type, occurred_on, amount_minor, account_id, category_id, created_at, updated_at)
      VALUES ('seed', 'o', 1, 'expense', '2026-09-01', -100, 'bank', 'shop', '${NOW}', '${NOW}');
  `);
  return h;
}

const candidate = fc.record({
  type: fc.constantFrom(...TRANSACTION_TYPES),
  amount: fc.oneof(
    fc.constant(0),
    fc.constantFrom(-1, 1),
    fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
  ),
  counterAccountId: fc.constantFrom(null, "bank", "cash"),
  categoryId: fc.constantFrom(null, "shop"),
  refundOfId: fc.constantFrom(null, "seed"),
});

describe("domain shape rules ⇔ database CHECKs", () => {
  it("agree on every generated row", () => {
    fc.assert(
      fc.property(candidate, (row) => {
        const h = seededDatabase();
        try {
          const domainAccepts =
            shapeViolations({ ...row, amountMinor: money(row.amount), accountId: "bank" })
              .length === 0;
          let databaseAccepts = true;
          try {
            h.sqlite
              .prepare(
                `INSERT INTO transactions (id, owner_id, sequence, type, occurred_on, amount_minor, account_id,
                   counter_account_id, category_id, refund_of_id, created_at, updated_at)
                 VALUES ('t', 'o', 2, ?, '2026-09-10', ?, 'bank', ?, ?, ?, '${NOW}', '${NOW}')`,
              )
              .run(row.type, row.amount, row.counterAccountId, row.categoryId, row.refundOfId);
          } catch (error) {
            expect((error as { code: string }).code).toBe("SQLITE_CONSTRAINT_CHECK");
            databaseAccepts = false;
          }
          expect(databaseAccepts).toBe(domainAccepts);
        } finally {
          h.close();
        }
      }),
      { numRuns: 400 },
    );
  });
});
