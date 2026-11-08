import type { TransactionType } from "@/domain/ledger/transactions";
import type { ServiceContext } from "@/server/context";
import { searchActivity } from "@/server/repositories/activity-queries";
import { readOwnerData } from "@/server/repositories/owner-data-repository";

/**
 * Your data, taken out of FinPilot: a complete backup (JSON) and the
 * transactions as a spreadsheet (CSV). Reading only; nothing is changed.
 */

export interface ExportFile {
  readonly filename: string;
  readonly contentType: string;
  readonly body: string;
}

/** What a FinPilot backup file says it is. A restore checks both before reading on. */
export const BACKUP_FORMAT = "finpilot-backup";
export const BACKUP_VERSION = 1;

/**
 * Everything the owner has, as stored: the owner's settings and every owned
 * table, deleted entries included, with the schema they were written in. It is
 * complete enough to put the ledger back exactly as it was.
 */
export async function exportBackup(ctx: ServiceContext): Promise<ExportFile> {
  const snapshot = readOwnerData(ctx.db, ctx.ownerId);
  const backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: ctx.now().toISOString(),
    schema: { appliedMigrations: snapshot.appliedMigrations },
    owner: snapshot.owner,
    tables: Object.fromEntries(snapshot.tables.map((t) => [t.name, t.rows])),
  };
  return {
    filename: `finpilot-backup-${ctx.clock.today()}.json`,
    contentType: "application/json; charset=utf-8",
    body: `${JSON.stringify(backup, null, 2)}\n`,
  };
}

const TYPE_LABEL: Record<TransactionType, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
  refund: "Refund",
  opening_balance: "Opening balance",
  adjustment: "Balance adjustment",
};

/** An amount in minor units as a plain decimal a spreadsheet reads as a number: -450.00. */
export const csvAmount = (minor: number) =>
  `${minor < 0 ? "-" : ""}${(Math.abs(minor) / 100).toFixed(2)}`;

/**
 * One CSV field. Quoted when it holds a comma, quote or line break; text that
 * a spreadsheet would run as a formula (= + - @, tab, return) is prefixed with
 * an apostrophe so it stays text (OWASP CSV injection).
 */
export function csvField(value: string | null, kind: "text" | "number" = "text"): string {
  let text = value ?? "";
  if (kind === "text" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Every active transaction, oldest first, one row each: a transfer is one row
 * (From and To), and its fee its own expense row. Amount is the effect on
 * Account: negative when money left it.
 */
export async function exportTransactionsCsv(
  ctx: ServiceContext,
  currency: string,
): Promise<ExportFile> {
  const rows = searchActivity(ctx.db, ctx.ownerId, {}).reverse();
  const header = [
    "Date",
    "Type",
    `Amount (${currency})`,
    "Account",
    "To account",
    "Category",
    "Description",
    "Note",
  ];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        csvField(r.occurredOn, "number"),
        csvField(TYPE_LABEL[r.type]),
        csvField(csvAmount(r.amountMinor), "number"),
        csvField(r.accountName),
        csvField(r.counterAccountName),
        csvField(r.categoryName),
        csvField(r.description),
        csvField(r.note),
      ].join(","),
    ),
  ];
  return {
    filename: `finpilot-transactions-${ctx.clock.today()}.csv`,
    contentType: "text/csv; charset=utf-8",
    // The byte-order mark makes Excel read the file as UTF-8 (৳, Bengali names).
    body: `﻿${lines.join("\r\n")}\r\n`,
  };
}
