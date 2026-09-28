import {
  availableBridge,
  type AvailableAccountLine,
  type AvailableBridge,
  type AvailableCommitmentLine,
  type AvailableEarmarkLine,
} from "@/domain/available/bridge";
import type { OccurrenceDisplayState } from "@/domain/commitments/occurrences";
import type { ServiceContext } from "@/server/context";
import { listItems } from "@/server/repositories/protected-money-queries";
import { getOccurrences } from "@/server/services/commitment-service";
import { getAccountBalances } from "@/server/services/ledger-service";
import { getEarmarkBacking } from "@/server/services/protected-money-service";
import { getAccounts } from "@/server/services/setup-service";

/**
 * Available's read model (docs/domain-model.md §10). It loads each input from
 * the feature that owns it and derives nothing itself:
 *
 * - balances from the ledger (getAccountBalances), with each account's stored
 *   `included_in_available` and archive state (getAccounts);
 * - pending occurrences from Commitments (getOccurrences materialises them and
 *   derives their state from the ledger);
 * - covered amounts from Protected money (getEarmarkBacking, the one place
 *   backing is derived).
 *
 * The pure bridge selects and sums them; this layer only adds the names the
 * evidence needs. Recomputed on every read, never stored.
 */

export interface AvailableAccountView extends AvailableAccountLine {
  readonly name: string;
  readonly archived: boolean;
}

export interface AvailableCommitmentView extends AvailableCommitmentLine {
  readonly commitmentId: string;
  readonly name: string;
  /** Upcoming, due today or overdue, as Commitments shows it. */
  readonly display: OccurrenceDisplayState;
}

export interface AvailableEarmarkView extends AvailableEarmarkLine {
  readonly itemName: string;
  readonly accountName: string;
}

export interface AvailableView extends Omit<
  AvailableBridge,
  "accounts" | "commitments" | "earmarks"
> {
  readonly accounts: readonly AvailableAccountView[];
  readonly commitments: readonly AvailableCommitmentView[];
  readonly earmarks: readonly AvailableEarmarkView[];
}

export async function getAvailable(ctx: ServiceContext): Promise<AvailableView> {
  const accounts = await getAccounts(ctx);
  const balances = new Map((await getAccountBalances(ctx)).map((b) => [b.accountId, b.balance]));
  const occurrences = await getOccurrences(ctx);
  const backing = await getEarmarkBacking(ctx);

  const bridge = availableBridge({
    today: ctx.clock.today(),
    accounts: accounts.map((a) => {
      const balance = balances.get(a.id);
      if (balance === undefined) throw new Error(`No balance for account ${a.id}.`);
      return {
        accountId: a.id,
        type: a.type,
        includedInAvailable: a.includedInAvailable,
        balance,
      };
    }),
    occurrences: occurrences.map((o) => ({
      occurrenceId: o.id,
      dueOn: o.dueOn,
      expectedAmount: o.expectedAmount,
      state: o.state,
    })),
    earmarks: backing.map(({ itemId, accountId, covered }) => ({ itemId, accountId, covered })),
  });

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const occurrenceById = new Map(occurrences.map((o) => [o.id, o]));
  const itemNames = new Map(listItems(ctx.db, ctx.ownerId).map((i) => [i.id, i.name]));

  return {
    ...bridge,
    accounts: bridge.accounts.map((line) => {
      const account = accountById.get(line.accountId)!;
      return { ...line, name: account.name, archived: account.archivedAt !== null };
    }),
    commitments: bridge.commitments.map((line) => {
      const occurrence = occurrenceById.get(line.occurrenceId)!;
      return {
        ...line,
        commitmentId: occurrence.commitmentId,
        name: occurrence.name,
        display: occurrence.display,
      };
    }),
    earmarks: bridge.earmarks.map((line) => ({
      ...line,
      itemName: itemNames.get(line.itemId)!,
      accountName: accountById.get(line.accountId)!.name,
    })),
  };
}
