import { getTableName } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import { OWNED_TABLES } from "@/db/owned-tables";
import { recordEntry, removeEntry } from "@/server/commands";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  csvAmount,
  csvField,
  exportBackup,
  exportTransactionsCsv,
} from "@/server/services/export-service";
import { createAccount, createOwner } from "@/server/services/setup-service";
import { uuidV7Generator } from "@/server/ids";

import { d, ok, setupLedger, taka } from "../support/ledger";

/** Your data, taken out: a complete backup, and the transactions as a spreadsheet. */
let handle: DatabaseHandle | undefined;
afterEach(() => handle?.close());

async function ledger() {
  const setup = await setupLedger();
  handle = setup.handle;
  const cash = await setup.account("Cash", "cash", "2026-09-01", 3_000);
  const bkash = await setup.account("bKash", "mobile_wallet", "2026-09-01", 6_000);
  const record = async (entry: Record<string, unknown>) =>
    ok(await recordEntry(setup.ctx, { occurredOn: "2026-09-10", ...entry })).ids;
  return { ...setup, cash, bkash, record };
}

const csvLines = (body: string) => body.replace(/^﻿/, "").trimEnd().split("\r\n");

describe("exportBackup", () => {
  it("holds every owned table, deleted entries included, and says what it is", async () => {
    const { ctx, cash, category, record } = await ledger();
    const [lunch] = await record({
      type: "expense",
      amount: "450",
      accountId: cash,
      categoryId: category("Food & Dining"),
      description: "Lunch",
    });
    ok(await removeEntry(ctx, lunch!));

    const file = await exportBackup(ctx);
    expect(file.filename).toBe("finpilot-backup-2026-09-22.json");
    const backup = JSON.parse(file.body);
    expect(backup).toMatchObject({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      owner: { id: ctx.ownerId, base_currency: "BDT", time_zone: "Asia/Dhaka" },
    });
    expect(backup.schema.appliedMigrations).toBeGreaterThan(0);
    expect(Object.keys(backup.tables)).toEqual(OWNED_TABLES.map((t) => getTableName(t)));

    const deleted = backup.tables.transactions.find((r: { id: string }) => r.id === lunch);
    expect(deleted).toMatchObject({ description: "Lunch", amount_minor: -45_000 });
    expect(deleted.deleted_at).not.toBeNull();
    expect(backup.tables.accounts.map((a: { name: string }) => a.name)).toEqual(["Cash", "bKash"]);
  });

  it("never holds another owner's data", async () => {
    const { ctx } = await ledger();
    const other = ok(
      await createOwner(
        { db: ctx.db, ids: uuidV7Generator, now: ctx.now },
        { name: "Someone else", baseCurrency: "BDT", timeZone: "Asia/Dhaka" },
      ),
    );
    ok(
      await createAccount(
        { ...ctx, ownerId: other },
        { name: "Their bank", type: "bank", openedOn: d("2026-09-01"), openingBalance: taka(500) },
      ),
    );
    const backup = JSON.parse((await exportBackup(ctx)).body);
    for (const rows of Object.values(backup.tables) as { owner_id: string }[][]) {
      for (const row of rows) expect(row.owner_id).toBe(ctx.ownerId);
    }
    expect(JSON.stringify(backup)).not.toContain("Their bank");
  });
});

describe("exportTransactionsCsv", () => {
  it("lists every active transaction oldest first, signed by its effect on Account", async () => {
    const { ctx, cash, bkash, category, record } = await ledger();
    await record({
      type: "expense",
      amount: "450",
      accountId: cash,
      categoryId: category("Food & Dining"),
      description: "Lunch",
    });
    await record({
      type: "transfer",
      amount: "2000",
      accountId: bkash,
      counterAccountId: cash,
      fee: "37",
      feeCategoryId: category("Fees & Charges"),
      occurredOn: "2026-09-12",
      description: "Cash-out",
    });
    const [gone] = await record({
      type: "income",
      amount: "100",
      accountId: cash,
      categoryId: category("Other Income"),
      description: "Deleted later",
    });
    ok(await removeEntry(ctx, gone!));

    const file = await exportTransactionsCsv(ctx, "BDT");
    expect(file.filename).toBe("finpilot-transactions-2026-09-22.csv");
    expect(file.body.startsWith("﻿")).toBe(true);
    expect(csvLines(file.body)).toEqual([
      "Date,Type,Amount (BDT),Account,To account,Category,Description,Note",
      "2026-09-01,Opening balance,3000.00,Cash,,,,",
      "2026-09-01,Opening balance,6000.00,bKash,,,,",
      "2026-09-10,Expense,-450.00,Cash,,Food & Dining,Lunch,",
      "2026-09-12,Transfer,-2000.00,bKash,Cash,,Cash-out,",
      "2026-09-12,Expense,-37.00,bKash,,Fees & Charges,Cash-out (fee),",
    ]);
  });

  it("keeps awkward text whole, and never lets it run as a spreadsheet formula", async () => {
    const { ctx, cash, category, record } = await ledger();
    await record({
      type: "expense",
      amount: "100",
      accountId: cash,
      categoryId: category("Shopping"),
      description: '=HYPERLINK("x"), "quoted", and more',
    });
    const last = csvLines((await exportTransactionsCsv(ctx, "BDT")).body).at(-1);
    expect(last).toBe(
      `2026-09-10,Expense,-100.00,Cash,,Shopping,"'=HYPERLINK(""x""), ""quoted"", and more",`,
    );
  });
});

describe("CSV fields", () => {
  it("writes amounts as plain numbers a spreadsheet reads", () => {
    expect([csvAmount(-45_000), csvAmount(5), csvAmount(0), csvAmount(1_234_567)]).toEqual([
      "-450.00",
      "0.05",
      "0.00",
      "12345.67",
    ]);
  });

  it("quotes only when needed, and guards formula characters in text alone", () => {
    expect(csvField("Food & Dining")).toBe("Food & Dining");
    expect(csvField(null)).toBe("");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField("line\nbreak")).toBe('"line\nbreak"');
    expect(csvField("+880 1711")).toBe("'+880 1711");
    expect(csvField("@home")).toBe("'@home");
    expect(csvField("-450.00", "number")).toBe("-450.00");
  });
});
