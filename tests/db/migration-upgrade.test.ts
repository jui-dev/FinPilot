import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { openDatabase } from "@/db/client";
import { MIGRATIONS_FOLDER, migrateDatabase } from "@/db/migrate";

/**
 * Migrations must work on databases that already hold data, not just on empty
 * ones. This applies the history up to a given migration, writes realistic
 * rows, then applies the rest and checks nothing was lost or broken.
 */
const scratch = mkdtempSync(path.join(tmpdir(), "finpilot-migrations-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** A copy of the migrations folder whose journal stops after `count` migrations. */
function migrationsUpTo(count: number): string {
  const folder = path.join(scratch, `upto-${count}`);
  cpSync(MIGRATIONS_FOLDER, folder, { recursive: true });
  const journalPath = path.join(folder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: unknown[] };
  journal.entries = journal.entries.slice(0, count);
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

const NOW = "2026-09-22T00:00:00.000Z";

function seedLedger(run: (sql: string) => void) {
  run(`INSERT INTO owners (id, name, base_currency, time_zone, next_transaction_sequence, created_at, updated_at)
       VALUES ('o', 'O', 'BDT', 'Asia/Dhaka', 7, '${NOW}', '${NOW}')`);
  run(`INSERT INTO accounts (id, owner_id, name, type, currency, included_in_available, opened_on, created_at, updated_at) VALUES
       ('bank', 'o', 'Bank', 'bank', 'BDT', 1, '2026-08-01', '${NOW}', '${NOW}'),
       ('visa', 'o', 'Visa', 'credit_card', 'BDT', 1, '2026-08-01', '${NOW}', '${NOW}')`);
  run(`INSERT INTO categories (id, owner_id, name, kind, created_at, updated_at)
       VALUES ('shop', 'o', 'Shopping', 'expense', '${NOW}', '${NOW}')`);
  run(`INSERT INTO transactions (id, owner_id, sequence, type, occurred_on, amount_minor, account_id,
         counter_account_id, category_id, refund_of_id, group_id, deleted_at, created_at, updated_at) VALUES
       ('t1', 'o', 1, 'opening_balance', '2026-08-01', 8500000, 'bank', NULL, NULL, NULL, NULL, NULL, '${NOW}', '${NOW}'),
       ('t2', 'o', 2, 'opening_balance', '2026-08-01', -1200000, 'visa', NULL, NULL, NULL, NULL, NULL, '${NOW}', '${NOW}'),
       ('t3', 'o', 3, 'expense', '2026-09-08', -300000, 'visa', NULL, 'shop', NULL, NULL, NULL, '${NOW}', '${NOW}'),
       ('t4', 'o', 4, 'refund', '2026-09-16', 120000, 'visa', NULL, 'shop', 't3', NULL, NULL, '${NOW}', '${NOW}'),
       ('t5', 'o', 5, 'transfer', '2026-09-10', -1200000, 'bank', 'visa', NULL, NULL, 'g', NULL, '${NOW}', '${NOW}'),
       ('t6', 'o', 6, 'expense', '2026-09-11', -5000, 'bank', NULL, 'shop', NULL, NULL, '${NOW}', '${NOW}', '${NOW}')`);
}

const balances = (h: ReturnType<typeof openDatabase>) =>
  h.sqlite
    .prepare(
      "SELECT account_id, sum(delta_minor) AS balance FROM account_entries GROUP BY account_id ORDER BY account_id",
    )
    .all();

describe("0002_fix_date_checks on a database with data", () => {
  it("preserves every row, balance, foreign key and view, and enforces the fixed CHECK", () => {
    const h = openDatabase(":memory:");
    migrateDatabase(h, migrationsUpTo(2));
    seedLedger((sql) => h.sqlite.exec(sql));

    // The bug being fixed: malformed dates were accepted before 0002.
    h.sqlite.exec(`UPDATE accounts SET opened_on = '2026-8-1' WHERE id = 'visa'`);
    h.sqlite.exec(`UPDATE accounts SET opened_on = '2026-08-01' WHERE id = 'visa'`);

    const before = {
      transactions: h.sqlite.prepare("SELECT * FROM transactions ORDER BY id").all(),
      accounts: h.sqlite.prepare("SELECT * FROM accounts ORDER BY id").all(),
      balances: balances(h),
    };
    expect(before.balances).toEqual([
      { account_id: "bank", balance: 8_500_000 - 1_200_000 },
      { account_id: "visa", balance: -1_200_000 - 300_000 + 120_000 + 1_200_000 },
    ]);

    migrateDatabase(h);

    expect(h.sqlite.prepare("SELECT * FROM transactions ORDER BY id").all()).toEqual(
      before.transactions,
    );
    expect(h.sqlite.prepare("SELECT * FROM accounts ORDER BY id").all()).toEqual(before.accounts);
    expect(balances(h)).toEqual(before.balances);
    expect(h.sqlite.pragma("foreign_key_check")).toEqual([]);
    expect(h.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(h.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(
      h.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE name LIKE '\\_\\_new%' ESCAPE '\\' OR name LIKE '\\_\\_fk%' ESCAPE '\\'",
        )
        .all(),
    ).toEqual([]);
    expect(
      h.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name").all(),
    ).toEqual([{ name: "account_entries" }, { name: "active_transactions" }]);

    // Foreign keys resolve to the rebuilt tables and are enforced again.
    expect(() =>
      h.sqlite.exec(
        `INSERT INTO transactions (id, owner_id, sequence, type, occurred_on, amount_minor, account_id, category_id, created_at, updated_at)
         VALUES ('t9', 'o', 9, 'expense', '2026-09-12', -1, 'missing', 'shop', '${NOW}', '${NOW}')`,
      ),
    ).toThrow(/FOREIGN KEY/);
    expect(() => h.sqlite.exec(`DELETE FROM transactions WHERE id = 't3'`)).toThrow(/FOREIGN KEY/);

    // The fix itself.
    expect(() =>
      h.sqlite.exec(`UPDATE accounts SET opened_on = '2026-8-1' WHERE id = 'visa'`),
    ).toThrow(/ck_accounts_opened_on/);
    expect(() =>
      h.sqlite.exec(`UPDATE transactions SET occurred_on = '2026-9-10' WHERE id = 't5'`),
    ).toThrow(/ck_transactions_occurred_on/);
    h.close();
  });

  it("aborts and rolls back if the rebuilt tables would violate a foreign key", () => {
    const h = openDatabase(":memory:");
    migrateDatabase(h, migrationsUpTo(2));
    seedLedger((sql) => h.sqlite.exec(sql));
    // Plant an orphan (possible only with enforcement off, e.g. from a bad import).
    h.sqlite.pragma("foreign_keys = OFF");
    h.sqlite.exec(`UPDATE transactions SET category_id = 'missing' WHERE id = 't3'`);
    h.sqlite.pragma("foreign_keys = ON");
    const schemaBefore = h.sqlite
      .prepare("SELECT name, sql FROM sqlite_master ORDER BY name")
      .all();

    expect(() => migrateDatabase(h)).toThrow();

    // Nothing from 0002 was committed: the schema is exactly as before.
    expect(h.sqlite.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all()).toEqual(
      schemaBefore,
    );
    expect(h.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    h.close();
  });
});
