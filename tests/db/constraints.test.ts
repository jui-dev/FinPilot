import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";

import { freshDatabase } from "../support/database";

/**
 * The database is the last line of defence: these tests bypass the domain and
 * services entirely and insert raw rows, proving each constraint on its own.
 */
let h: DatabaseHandle;
let seq = 100;

const NOW = "2026-09-22T00:00:00.000Z";

function exec(sql: string, ...params: unknown[]) {
  return h.sqlite.prepare(sql).run(...params);
}

function seedOwner(id: string) {
  exec(
    "INSERT INTO owners (id, name, base_currency, time_zone, created_at, updated_at) VALUES (?, 'O', 'BDT', 'Asia/Dhaka', ?, ?)",
    id,
    NOW,
    NOW,
  );
  for (const [acc, type] of [
    ["bank", "bank"],
    ["cash", "cash"],
    ["visa", "credit_card"],
  ] as const) {
    exec(
      "INSERT INTO accounts (id, owner_id, name, type, currency, included_in_available, opened_on, created_at, updated_at) VALUES (?, ?, ?, ?, 'BDT', 1, '2026-08-01', ?, ?)",
      `${id}-${acc}`,
      id,
      acc,
      type,
      NOW,
      NOW,
    );
  }
  exec(
    "INSERT INTO categories (id, owner_id, name, kind, created_at, updated_at) VALUES (?, ?, 'Shopping', 'expense', ?, ?)",
    `${id}-shopping`,
    id,
    NOW,
    NOW,
  );
}

interface Row {
  id: string;
  owner_id: string;
  sequence: number;
  type: string;
  occurred_on: string;
  amount_minor: unknown;
  account_id: string;
  counter_account_id: string | null;
  category_id: string | null;
  refund_of_id: string | null;
  deleted_at: string | null;
}

function insert(patch: Partial<Row> = {}) {
  const row: Row = {
    id: `tx-${++seq}`,
    owner_id: "o1",
    sequence: seq,
    type: "expense",
    occurred_on: "2026-09-10",
    amount_minor: -500,
    account_id: "o1-bank",
    counter_account_id: null,
    category_id: "o1-shopping",
    refund_of_id: null,
    deleted_at: null,
    ...patch,
  };
  exec(
    `INSERT INTO transactions (id, owner_id, sequence, type, occurred_on, amount_minor, account_id,
       counter_account_id, category_id, refund_of_id, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    row.owner_id,
    row.sequence,
    row.type,
    row.occurred_on,
    row.amount_minor,
    row.account_id,
    row.counter_account_id,
    row.category_id,
    row.refund_of_id,
    row.deleted_at,
    NOW,
    NOW,
  );
  return row.id;
}

function rejects(patch: Partial<Row>, pattern: RegExp) {
  expect(() => insert(patch)).toThrow(pattern);
}

beforeEach(() => {
  h = freshDatabase();
  seedOwner("o1");
  seedOwner("o2");
});
afterEach(() => h.close());

describe("valid rows are accepted", () => {
  it.each<[string, Partial<Row>]>([
    ["expense", {}],
    ["income", { type: "income", amount_minor: 100 }],
    ["refund", { type: "refund", amount_minor: 100 }],
    ["transfer", { type: "transfer", counter_account_id: "o1-cash", category_id: null }],
    [
      "opening balance (negative, liability)",
      {
        type: "opening_balance",
        amount_minor: -1_200_000,
        account_id: "o1-visa",
        category_id: null,
      },
    ],
    ["adjustment", { type: "adjustment", amount_minor: -35_000, category_id: null }],
  ])("%s", (_label, patch) => {
    expect(() => insert(patch)).not.toThrow();
  });
});

describe("per-type shape CHECKs (named)", () => {
  it.each<[string, Partial<Row>, string]>([
    ["expense with a positive amount", { amount_minor: 500 }, "ck_transactions_expense"],
    ["expense without a category", { category_id: null }, "ck_transactions_expense"],
    [
      "expense with a counter account",
      { counter_account_id: "o1-cash" },
      "ck_transactions_expense",
    ],
    ["income with a negative amount", { type: "income" }, "ck_transactions_income"],
    [
      "income without a category",
      { type: "income", amount_minor: 1, category_id: null },
      "ck_transactions_income",
    ],
    ["refund with a negative amount", { type: "refund" }, "ck_transactions_refund"],
    [
      "transfer without a counter account",
      { type: "transfer", category_id: null },
      "ck_transactions_transfer",
    ],
    [
      "transfer to itself",
      { type: "transfer", category_id: null, counter_account_id: "o1-bank" },
      "ck_transactions_transfer",
    ],
    [
      "transfer with a category",
      { type: "transfer", counter_account_id: "o1-cash" },
      "ck_transactions_transfer",
    ],
    [
      "transfer with a positive amount",
      { type: "transfer", amount_minor: 5, category_id: null, counter_account_id: "o1-cash" },
      "ck_transactions_transfer",
    ],
    [
      "zero opening balance",
      { type: "opening_balance", amount_minor: 0, category_id: null },
      "ck_transactions_opening_adjustment",
    ],
    [
      "adjustment with a category",
      { type: "adjustment", amount_minor: 5 },
      "ck_transactions_opening_adjustment",
    ],
    ["unknown type", { type: "gift", amount_minor: 5 }, "ck_transactions_type"],
  ])("rejects %s", (_label, patch, constraint) => {
    rejects(patch, new RegExp(`CHECK constraint failed: ${constraint}`));
  });

  it("rejects refund_of_id on a non-refund", () => {
    const expense = insert();
    rejects({ refund_of_id: expense }, /ck_transactions_expense/);
  });
});

describe("type-shape CHECKs (SQLite-only; native types in PostgreSQL)", () => {
  it("rejects a non-integer amount", () => {
    rejects({ amount_minor: -5.5 }, /ck_transactions_amount_integer/);
    rejects({ amount_minor: "abc" as unknown }, /ck_transactions_amount_integer/);
  });

  it("stores integer-looking text as an integer (column affinity), which the CHECK then accepts", () => {
    const id = insert({ amount_minor: "-500" as unknown });
    expect(
      h.sqlite.prepare("SELECT typeof(amount_minor) AS t FROM transactions WHERE id = ?").get(id),
    ).toEqual({ t: "integer" });
  });

  it.each([
    "2026-02-30",
    "2026-9-10",
    "10-09-2026",
    "2026-09-10T00:00",
    "2026-13-01",
    "not a date",
  ])("rejects the date %s", (date) => {
    rejects({ occurred_on: date }, /ck_transactions_occurred_on/);
  });

  it("rejects an invalid account opened_on", () => {
    expect(() =>
      exec(
        "INSERT INTO accounts (id, owner_id, name, type, currency, included_in_available, opened_on, created_at, updated_at) VALUES ('x', 'o1', 'X', 'cash', 'BDT', 1, '2026-13-01', ?, ?)",
        NOW,
        NOW,
      ),
    ).toThrow(/ck_accounts_opened_on/);
  });
});

describe("owner-consistent composite foreign keys (D1)", () => {
  it("rejects an unknown account", () => {
    rejects({ account_id: "nope" }, /FOREIGN KEY constraint failed/);
  });

  it("rejects another owner's account, counter account, category or refund target", () => {
    rejects({ account_id: "o2-bank" }, /FOREIGN KEY constraint failed/);
    rejects(
      { type: "transfer", category_id: null, counter_account_id: "o2-cash" },
      /FOREIGN KEY constraint failed/,
    );
    rejects({ category_id: "o2-shopping" }, /FOREIGN KEY constraint failed/);
    const foreignExpense = insert({
      owner_id: "o2",
      account_id: "o2-bank",
      category_id: "o2-shopping",
    });
    rejects(
      { type: "refund", amount_minor: 1, refund_of_id: foreignExpense },
      /FOREIGN KEY constraint failed/,
    );
  });

  it("restricts deleting an account that has transactions", () => {
    insert();
    expect(() => exec("DELETE FROM accounts WHERE id = 'o1-bank'")).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });
});

describe("uniqueness", () => {
  it("allows at most one ACTIVE opening balance per account", () => {
    const first = insert({ type: "opening_balance", amount_minor: 100, category_id: null });
    rejects(
      { type: "opening_balance", amount_minor: 200, category_id: null },
      /UNIQUE constraint failed/,
    );
    exec("UPDATE transactions SET deleted_at = ? WHERE id = ?", NOW, first);
    expect(() =>
      insert({ type: "opening_balance", amount_minor: 200, category_id: null }),
    ).not.toThrow();
    expect(() => exec("UPDATE transactions SET deleted_at = NULL WHERE id = ?", first)).toThrow(
      /UNIQUE constraint failed/,
    );
  });

  it("permits opening balances on different accounts", () => {
    insert({ type: "opening_balance", amount_minor: 100, category_id: null });
    expect(() =>
      insert({
        type: "opening_balance",
        amount_minor: 100,
        category_id: null,
        account_id: "o1-cash",
      }),
    ).not.toThrow();
  });

  it("rejects a duplicate (owner, sequence) but allows the same sequence for another owner", () => {
    insert({ sequence: 7 });
    rejects({ sequence: 7 }, /UNIQUE constraint failed/);
    expect(() =>
      insert({ sequence: 7, owner_id: "o2", account_id: "o2-bank", category_id: "o2-shopping" }),
    ).not.toThrow();
  });

  it("rejects duplicate account names per owner, case-insensitively", () => {
    expect(() =>
      exec(
        "INSERT INTO accounts (id, owner_id, name, type, currency, included_in_available, opened_on, created_at, updated_at) VALUES ('y', 'o1', 'BANK', 'bank', 'BDT', 1, '2026-08-01', ?, ?)",
        NOW,
        NOW,
      ),
    ).toThrow(/UNIQUE constraint failed/);
  });
});

describe("account_entries view", () => {
  it("mirrors transfers so they net to zero, and hides soft-deleted rows", () => {
    insert({
      type: "transfer",
      amount_minor: -2_000,
      counter_account_id: "o1-cash",
      category_id: null,
    });
    const deleted = insert({ amount_minor: -700 });
    exec("UPDATE transactions SET deleted_at = ? WHERE id = ?", NOW, deleted);
    const entries = h.sqlite
      .prepare("SELECT account_id, delta_minor FROM account_entries ORDER BY account_id")
      .all();
    expect(entries).toEqual([
      { account_id: "o1-bank", delta_minor: -2_000 },
      { account_id: "o1-cash", delta_minor: 2_000 },
    ]);
  });
});

describe("reconciliation_checkpoints", () => {
  const checkpoint = (values: Partial<Record<string, unknown>> = {}) => {
    const row = {
      id: `cp-${seq++}`,
      owner_id: "o1",
      account_id: "o1-cash",
      as_of: "2026-09-20",
      stated_balance_minor: 420_000,
      adjustment_id: null,
      ...values,
    };
    return exec(
      "INSERT INTO reconciliation_checkpoints (id, owner_id, account_id, as_of, stated_balance_minor, adjustment_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      row.id,
      row.owner_id,
      row.account_id,
      row.as_of,
      row.stated_balance_minor,
      row.adjustment_id,
      NOW,
      NOW,
    );
  };

  it("accepts a checkpoint with no adjustment, and a stated balance of zero", () => {
    expect(() => checkpoint()).not.toThrow();
    expect(() => checkpoint({ stated_balance_minor: 0 })).not.toThrow();
  });

  it("accepts more than one checkpoint for the same account and date", () => {
    // Deliberate: a checkpoint is a historical observation, not an upsert key.
    checkpoint();
    expect(() => checkpoint()).not.toThrow();
  });

  it("rejects a malformed as_of date", () => {
    expect(() => checkpoint({ as_of: "2026-9-20" })).toThrow(/CHECK constraint failed/);
    expect(() => checkpoint({ as_of: "not-a-date" })).toThrow(/CHECK constraint failed/);
  });

  it("rejects a non-integer stated balance", () => {
    expect(() => checkpoint({ stated_balance_minor: 4_200.5 })).toThrow(
      /ck_reconciliation_checkpoints_stated_integer/,
    );
    expect(() => checkpoint({ stated_balance_minor: "abc" })).toThrow(
      /ck_reconciliation_checkpoints_stated_integer/,
    );
  });

  it("rejects an account belonging to another owner", () => {
    expect(() => checkpoint({ account_id: "o2-cash" })).toThrow(/FOREIGN KEY constraint failed/);
  });

  it("rejects an adjustment belonging to another owner", () => {
    const foreign = insert({ owner_id: "o2", account_id: "o2-cash", category_id: "o2-shopping" });
    expect(() => checkpoint({ adjustment_id: foreign })).toThrow(/FOREIGN KEY constraint failed/);
  });

  it("refuses to delete an account that a checkpoint refers to", () => {
    checkpoint();
    expect(() => exec("DELETE FROM accounts WHERE id = 'o1-cash'")).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });
});

describe("commitments and occurrences", () => {
  const commitment = (values: Partial<Record<string, unknown>> = {}) => {
    const row = {
      id: `c-${seq++}`,
      owner_id: "o1",
      name: "Rent",
      category_id: "o1-shopping",
      expected_amount_minor: 3_000_000,
      expected_account_id: "o1-bank",
      frequency: "monthly",
      interval_count: 1,
      anchor_on: "2026-08-01",
      end_on: null,
      generate_from: "2026-08-01",
      ...values,
    };
    exec(
      `INSERT INTO commitments (id, owner_id, name, category_id, expected_amount_minor, expected_account_id,
         frequency, interval_count, anchor_on, end_on, generate_from, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.owner_id,
      row.name,
      row.category_id,
      row.expected_amount_minor,
      row.expected_account_id,
      row.frequency,
      row.interval_count,
      row.anchor_on,
      row.end_on,
      row.generate_from,
      NOW,
      NOW,
    );
    return row.id;
  };
  const occurrence = (values: Partial<Record<string, unknown>> = {}) => {
    const row = {
      id: `oc-${seq++}`,
      owner_id: "o1",
      commitment_id: "c-rent",
      due_on: `2026-${String(1 + (seq % 12)).padStart(2, "0")}-01`,
      expected_amount_minor: 3_000_000,
      transaction_id: null,
      skipped_at: null,
      ...values,
    };
    exec(
      `INSERT INTO commitment_occurrences (id, owner_id, commitment_id, due_on, expected_amount_minor,
         transaction_id, skipped_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.owner_id,
      row.commitment_id,
      row.due_on,
      row.expected_amount_minor,
      row.transaction_id,
      row.skipped_at,
      NOW,
      NOW,
    );
    return row.id;
  };

  beforeEach(() => {
    commitment({ id: "c-rent" });
  });

  it("accepts a valid commitment, with or without an expected account and end date", () => {
    expect(() => commitment({ expected_account_id: null })).not.toThrow();
    expect(() =>
      commitment({ frequency: "yearly", interval_count: 2, end_on: "2026-08-01" }),
    ).not.toThrow();
  });

  it("supports only monthly and yearly schedules", () => {
    expect(() => commitment({ frequency: "weekly" })).toThrow(/ck_commitments_frequency/);
  });

  it("rejects an interval below 1 or not an integer", () => {
    expect(() => commitment({ interval_count: 0 })).toThrow(/ck_commitments_interval/);
    expect(() => commitment({ interval_count: 1.5 })).toThrow(/ck_commitments_interval/);
  });

  it("rejects a non-positive or non-integer expected amount", () => {
    expect(() => commitment({ expected_amount_minor: 0 })).toThrow(/ck_commitments_amount/);
    expect(() => commitment({ expected_amount_minor: 10.5 })).toThrow(/ck_commitments_amount/);
  });

  it("rejects malformed dates and an end before the anchor", () => {
    expect(() => commitment({ anchor_on: "2026-8-1" })).toThrow(/ck_commitments_anchor_on/);
    expect(() => commitment({ generate_from: "soon" })).toThrow(/ck_commitments_generate_from/);
    expect(() => commitment({ end_on: "2026-07-31" })).toThrow(/ck_commitments_end_on/);
  });

  it("rejects a blank name", () => {
    expect(() => commitment({ name: "  " })).toThrow(/ck_commitments_name/);
  });

  it("rejects another owner's category or account", () => {
    expect(() => commitment({ category_id: "o2-shopping" })).toThrow(/FOREIGN KEY/);
    expect(() => commitment({ expected_account_id: "o2-bank" })).toThrow(/FOREIGN KEY/);
  });

  it("holds at most one occurrence per commitment and due date", () => {
    occurrence({ due_on: "2026-09-01" });
    expect(() => occurrence({ due_on: "2026-09-01" })).toThrow(/UNIQUE constraint failed/);
  });

  it("lets one transaction pay at most one occurrence", () => {
    const paid = insert();
    occurrence({ transaction_id: paid });
    expect(() => occurrence({ transaction_id: paid })).toThrow(/UNIQUE constraint failed/);
  });

  it("rejects an occurrence that is both linked and skipped", () => {
    expect(() => occurrence({ transaction_id: insert(), skipped_at: NOW })).toThrow(
      /ck_commitment_occurrences_outcome/,
    );
  });

  it("rejects a non-positive snapshot amount and a malformed due date", () => {
    expect(() => occurrence({ expected_amount_minor: 0 })).toThrow(
      /ck_commitment_occurrences_amount/,
    );
    expect(() => occurrence({ due_on: "2026-9-1" })).toThrow(/ck_commitment_occurrences_due_on/);
  });

  it("rejects another owner's commitment or transaction", () => {
    commitment({
      id: "c-other",
      owner_id: "o2",
      category_id: "o2-shopping",
      expected_account_id: null,
    });
    expect(() => occurrence({ commitment_id: "c-other" })).toThrow(/FOREIGN KEY/);
    const foreign = insert({ owner_id: "o2", account_id: "o2-bank", category_id: "o2-shopping" });
    expect(() => occurrence({ transaction_id: foreign })).toThrow(/FOREIGN KEY/);
  });

  it("restricts hard-deleting a linked transaction or a commitment with occurrences", () => {
    const paid = insert();
    occurrence({ transaction_id: paid });
    expect(() => exec("DELETE FROM transactions WHERE id = ?", paid)).toThrow(/FOREIGN KEY/);
    expect(() => exec("DELETE FROM commitments WHERE id = 'c-rent'")).toThrow(/FOREIGN KEY/);
  });

  it("restricts hard-deleting a category or account a commitment refers to", () => {
    expect(() => exec("DELETE FROM accounts WHERE id = 'o1-bank'")).toThrow(/FOREIGN KEY/);
    expect(() => exec("DELETE FROM categories WHERE id = 'o1-shopping'")).toThrow(/FOREIGN KEY/);
  });
});

describe("protected money: items, earmarks and entries", () => {
  const item = (values: Partial<Record<string, unknown>> = {}) => {
    const row = {
      id: `pm-${seq++}`,
      owner_id: "o1",
      name: "Laptop",
      target_minor: null,
      ...values,
    };
    exec(
      `INSERT INTO protected_money_items (id, owner_id, name, target_minor, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
      row.id,
      row.owner_id,
      row.name,
      row.target_minor,
      NOW,
      NOW,
    );
    return row.id;
  };
  const earmark = (values: Partial<Record<string, unknown>> = {}) => {
    const row = {
      id: `em-${seq++}`,
      owner_id: "o1",
      item_id: "pm-laptop",
      account_id: "o1-bank",
      priority: seq,
      ended_at: null,
      ...values,
    };
    exec(
      `INSERT INTO earmarks (id, owner_id, item_id, account_id, priority, ended_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.owner_id,
      row.item_id,
      row.account_id,
      row.priority,
      row.ended_at,
      NOW,
      NOW,
    );
    return row.id;
  };
  const entry = (values: Partial<Record<string, unknown>> = {}) => {
    const row = {
      id: `ee-${seq++}`,
      owner_id: "o1",
      earmark_id: "em-1",
      amount_minor: 100,
      ...values,
    };
    exec(
      `INSERT INTO earmark_entries (id, owner_id, earmark_id, amount_minor, created_at) VALUES (?, ?, ?, ?, ?)`,
      row.id,
      row.owner_id,
      row.earmark_id,
      row.amount_minor,
      NOW,
    );
    return row.id;
  };

  beforeEach(() => {
    item({ id: "pm-laptop", target_minor: 15_000_000 });
    earmark({ id: "em-1", priority: 1 });
  });

  it("accepts an item with or without a target, and signed entries", () => {
    expect(() => item({ target_minor: null })).not.toThrow();
    expect(() => entry({ amount_minor: 500 })).not.toThrow();
    expect(() => entry({ amount_minor: -200 })).not.toThrow();
  });

  it("rejects a blank name and a zero, negative or fractional target", () => {
    expect(() => item({ name: "  " })).toThrow(/ck_protected_money_items_name/);
    expect(() => item({ target_minor: 0 })).toThrow(/ck_protected_money_items_target/);
    expect(() => item({ target_minor: -1 })).toThrow(/ck_protected_money_items_target/);
    expect(() => item({ target_minor: 10.5 })).toThrow(/ck_protected_money_items_target/);
  });

  it("rejects a zero or fractional entry and a non-integer or non-positive priority", () => {
    expect(() => entry({ amount_minor: 0 })).toThrow(/ck_earmark_entries_amount/);
    expect(() => entry({ amount_minor: 1.5 })).toThrow(/ck_earmark_entries_amount/);
    expect(() => earmark({ account_id: "o1-cash", priority: 0 })).toThrow(/ck_earmarks_priority/);
    expect(() => earmark({ account_id: "o1-cash", priority: 2.5 })).toThrow(/ck_earmarks_priority/);
  });

  it("holds at most one active earmark per item and account, and never shares a priority", () => {
    expect(() => earmark({ priority: 50 })).toThrow(/UNIQUE/);
    expect(() => earmark({ account_id: "o1-cash", priority: 1 })).toThrow(/UNIQUE/);
    // An ended earmark does not block a new one for the same item and account.
    exec("UPDATE earmarks SET ended_at = ? WHERE id = 'em-1'", NOW);
    expect(() => earmark({ priority: 51 })).not.toThrow();
  });

  it("rejects another owner's item, account or earmark", () => {
    item({ id: "pm-other", owner_id: "o2" });
    expect(() => earmark({ item_id: "pm-other", priority: 60 })).toThrow(/FOREIGN KEY/);
    expect(() => earmark({ account_id: "o2-bank", priority: 61 })).toThrow(/FOREIGN KEY/);
    expect(() => entry({ owner_id: "o2" })).toThrow(/FOREIGN KEY/);
  });

  it("restricts hard-deleting an item, account or earmark that is referred to", () => {
    entry();
    expect(() => exec("DELETE FROM earmarks WHERE id = 'em-1'")).toThrow(/FOREIGN KEY/);
    expect(() => exec("DELETE FROM protected_money_items WHERE id = 'pm-laptop'")).toThrow(
      /FOREIGN KEY/,
    );
    expect(() => exec("DELETE FROM accounts WHERE id = 'o1-bank'")).toThrow(/FOREIGN KEY/);
  });
});

describe("signal dismissals", () => {
  const dismissal = (key: unknown, owner = "o1") =>
    exec(
      "INSERT INTO signal_dismissals (id, owner_id, signal_key, dismissed_at) VALUES (?, ?, ?, ?)",
      `sd-${++seq}`,
      owner,
      key,
      NOW,
    );

  it("holds one dismissal per owner and key, and the same key for another owner", () => {
    dismissal("spending_up:2026-09");
    expect(() => dismissal("spending_up:2026-09")).toThrow(/UNIQUE/);
    expect(() => dismissal("spending_up:2026-09", "o2")).not.toThrow();
  });

  it("rejects a blank or over-long key", () => {
    expect(() => dismissal("")).toThrow(/ck_signal_dismissals_key/);
    expect(() => dismissal("   ")).toThrow(/ck_signal_dismissals_key/);
    expect(() => dismissal("k".repeat(201))).toThrow(/ck_signal_dismissals_key/);
    expect(() => dismissal("k".repeat(200))).not.toThrow();
  });

  it("rejects an unknown owner, and keeps an owner with dismissals from being deleted", () => {
    expect(() => dismissal("spending_up:2026-09", "nobody")).toThrow(/FOREIGN KEY/);
    // An owner with nothing but a dismissal, so only that row can block the delete.
    exec(
      "INSERT INTO owners (id, name, base_currency, time_zone, created_at, updated_at) VALUES ('o3', 'O', 'BDT', 'Asia/Dhaka', ?, ?)",
      NOW,
      NOW,
    );
    dismissal("spending_up:2026-09", "o3");
    expect(() => exec("DELETE FROM owners WHERE id = 'o3'")).toThrow(/FOREIGN KEY/);
  });
});
