import type { CalendarDate } from "@/domain/calendar-date";
import type { AccountType } from "@/domain/ledger/accounts";
import { balanceDeltas, toLedgerRow, type LedgerRow } from "@/domain/ledger/transactions";
import { add, parseMoney, type Money } from "@/domain/money";

export type EntryType = "expense" | "income" | "transfer";

export interface PreviewAccount {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
  readonly balance: Money;
}

export interface PreviewInput {
  readonly type: EntryType;
  readonly amount: string;
  readonly accountId: string;
  readonly counterAccountId: string;
  readonly categoryId: string;
  readonly occurredOn: CalendarDate;
  /** The fee as typed, or null when the transfer has no fee. */
  readonly fee: string | null;
  readonly feeCategoryId: string;
}

export interface AccountEffect {
  readonly accountId: string;
  readonly name: string;
  readonly type: AccountType;
  readonly before: Money;
  readonly after: Money;
}

const positive = (typed: string): Money | null => {
  const parsed = parseMoney(typed);
  return parsed.ok && parsed.value > 0 ? parsed.value : null;
};

/**
 * What an entry would do to its account(s), before it is saved: the rows the
 * ledger would store (toLedgerRow) and how they move balances (balanceDeltas),
 * so the sign rules stay the ledger's own. Null until there is a positive
 * amount and every account it needs, so nothing is shown that is not real.
 */
export function previewEffects(
  input: PreviewInput,
  accounts: readonly PreviewAccount[],
): AccountEffect[] | null {
  const amount = positive(input.amount);
  const from = accounts.find((a) => a.id === input.accountId);
  if (amount === null || !from) return null;

  const rows: LedgerRow[] = [];
  const involved = [from];
  if (input.type === "transfer") {
    const to = accounts.find((a) => a.id === input.counterAccountId);
    if (!to || to.id === from.id) return null;
    involved.push(to);
    rows.push(
      toLedgerRow({
        type: "transfer",
        amount,
        accountId: from.id,
        counterAccountId: to.id,
        occurredOn: input.occurredOn,
      }),
    );
    if (input.fee !== null && input.fee.trim() !== "") {
      const fee = positive(input.fee);
      if (fee === null) return null;
      // Recorded as its own expense on the From account (recordTransferWithFee).
      rows.push(
        toLedgerRow({
          type: "expense",
          amount: fee,
          accountId: from.id,
          categoryId: input.feeCategoryId,
          occurredOn: input.occurredOn,
        }),
      );
    }
  } else {
    rows.push(
      toLedgerRow({
        type: input.type,
        amount,
        accountId: from.id,
        categoryId: input.categoryId,
        occurredOn: input.occurredOn,
      }),
    );
  }

  const deltas = rows.flatMap(balanceDeltas);
  return involved.map((account) => ({
    accountId: account.id,
    name: account.name,
    type: account.type,
    before: account.balance,
    after: deltas
      .filter((d) => d.accountId === account.id)
      .reduce((balance, d) => add(balance, d.delta), account.balance),
  }));
}
