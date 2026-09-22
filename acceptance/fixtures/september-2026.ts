import { openDatabase, type DatabaseHandle } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import { calendarDateFromIso, type CalendarDate } from "@/domain/calendar-date";
import { fixedClock } from "@/domain/clock";
import type { AccountType } from "@/domain/ledger/accounts";
import type { TransactionDraft } from "@/domain/ledger/transactions";
import { fromMajor } from "@/domain/money";
import type { ServiceContext } from "@/server/context";
import type { ServiceResult } from "@/server/errors";
import { uuidV7Generator } from "@/server/ids";
import { recordTransaction, recordTransferWithFee } from "@/server/services/ledger-service";
import { createAccount, createOwner, getCategories } from "@/server/services/setup-service";

/**
 * The mandatory acceptance scenario (docs/acceptance-scenarios.md), built
 * through the real services on a real, freshly migrated database.
 *
 * Stage F2 builds the August prologue (P0–P7) and September rows 1–9 and 11.
 * Row 10 (the Cash reconciliation, −350) is added in Stage 4, when the
 * reconcile service exists; commitment links (P2, P7, row 2) arrive in Stage 6.
 * Amounts are whole taka here and stored as integer poisha.
 */
export const TODAY = calendarDateFromIso("2026-09-22");
export const TIME_ZONE = "Asia/Dhaka";

export type ScenarioVariant =
  | "base"
  /** M3: row 5 (the card payment) wrongly entered as an expense −12,000 Bank / Other. */
  | "m3-card-payment-as-expense";

export interface Scenario {
  readonly handle: DatabaseHandle;
  readonly ctx: ServiceContext;
  readonly accounts: Readonly<Record<"bank" | "cash" | "bkash" | "savings" | "visa", string>>;
  readonly category: (name: string) => string;
  /** Transaction ids by scenario row label (P1…P7, R1…R11). */
  readonly rows: Readonly<Record<string, string>>;
}

const d = calendarDateFromIso;
const taka = fromMajor;

function unwrap<T>(label: string, result: ServiceResult<T>): T {
  if (!result.ok) throw new Error(`Scenario row ${label} was rejected: ${result.error.code}`);
  return result.value;
}

export async function buildSeptember2026(variant: ScenarioVariant = "base"): Promise<Scenario> {
  const handle = openDatabase(":memory:");
  migrateDatabase(handle);
  let tick = Date.UTC(2026, 8, 22, 6, 0, 0);
  const now = () => new Date((tick += 1000));

  const ownerId = unwrap(
    "owner",
    await createOwner(
      { db: handle.db, ids: uuidV7Generator, now },
      { name: "Demo", baseCurrency: "BDT", timeZone: TIME_ZONE },
    ),
  );
  const ctx: ServiceContext = {
    db: handle.db,
    ownerId,
    clock: fixedClock(TODAY),
    ids: uuidV7Generator,
    now,
  };

  const categoryIds = new Map((await getCategories(ctx)).map((c) => [c.name, c.id]));
  const category = (name: string) => {
    const id = categoryIds.get(name);
    if (!id) throw new Error(`Unknown category ${name}`);
    return id;
  };

  // P0 — opening balances on Aug 1.
  const open = async (name: string, type: AccountType, balance: number) =>
    unwrap(
      `P0 ${name}`,
      await createAccount(ctx, {
        name,
        type,
        openedOn: d("2026-08-01"),
        openingBalance: taka(balance),
      }),
    );
  const accounts = {
    bank: await open("Bank", "bank", 20_000),
    cash: await open("Cash", "cash", 2_200),
    bkash: await open("bKash", "mobile_wallet", 9_537),
    savings: await open("Savings", "savings", 120_000),
    visa: await open("Visa", "credit_card", -3_200),
  };

  const rows: Record<string, string> = {};
  const record = async (label: string, draft: TransactionDraft) => {
    rows[label] = unwrap(label, await recordTransaction(ctx, draft));
  };
  const expense = (on: string, amount: number, account: string, cat: string): TransactionDraft => ({
    type: "expense",
    amount: taka(amount),
    accountId: account,
    categoryId: category(cat),
    occurredOn: d(on),
  });
  const transfer = (on: string, amount: number, from: string, to: string): TransactionDraft => ({
    type: "transfer",
    amount: taka(amount),
    accountId: from,
    counterAccountId: to,
    occurredOn: d(on),
  });
  const cashOut = async (label: string, on: CalendarDate) => {
    const { transferId, feeId } = unwrap(
      label,
      await recordTransferWithFee(ctx, {
        fromAccountId: accounts.bkash,
        toAccountId: accounts.cash,
        amount: taka(2_000),
        fee: taka(37),
        feeCategoryId: category("Fees & Charges"),
        occurredOn: on,
        description: "bKash cash-out",
      }),
    );
    rows[label] = transferId;
    rows[`${label} fee`] = feeId;
  };
  const salary = (on: string): TransactionDraft => ({
    type: "income",
    amount: taka(95_000),
    accountId: accounts.bank,
    categoryId: category("Salary"),
    occurredOn: d(on),
  });

  // August prologue.
  await record("P1", salary("2026-08-01"));
  await record("P2", expense("2026-08-02", 30_000, accounts.bank, "Housing"));
  await record("P3", expense("2026-08-06", 5_000, accounts.visa, "Groceries"));
  await record("P4", expense("2026-08-09", 3_800, accounts.visa, "Shopping"));
  await cashOut("P5", d("2026-08-13"));
  await record("P6", expense("2026-08-15", 1_200, accounts.cash, "Food & Dining"));
  await record("P7", expense("2026-08-25", 1_500, accounts.bkash, "Utilities"));

  // September.
  await record("R1", salary("2026-09-01"));
  await record("R2", expense("2026-09-02", 30_000, accounts.bank, "Housing"));
  await record("R3", expense("2026-09-05", 4_200, accounts.visa, "Groceries"));
  await record("R4", expense("2026-09-08", 3_000, accounts.visa, "Shopping"));
  await record(
    "R5",
    variant === "m3-card-payment-as-expense"
      ? expense("2026-09-10", 12_000, accounts.bank, "Other")
      : transfer("2026-09-10", 12_000, accounts.bank, accounts.visa),
  );
  await record("R6", transfer("2026-09-12", 5_000, accounts.bank, accounts.bkash));
  await cashOut("R7", d("2026-09-14"));
  await record("R8", expense("2026-09-15", 450, accounts.cash, "Food & Dining"));
  await record("R9", {
    type: "refund",
    amount: taka(1_200),
    accountId: accounts.visa,
    refundOfId: rows.R4!,
    occurredOn: d("2026-09-16"),
  });
  // R10 — reconcile Cash (counted 4,200 → adjustment −350): Stage 4.
  await record("R11", expense("2026-09-21", 30_000, accounts.savings, "Health"));

  return { handle, ctx, accounts, category, rows };
}
