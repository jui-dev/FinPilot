import type { Metadata } from "next";

import { getRequestContext } from "@/app/_server/context";
import { AccountList, type AccountView } from "@/components/accounts/account-list";
import { NewAccountButton } from "@/components/accounts/new-account-panel";
import { PositionSummary } from "@/components/accounts/position-summary";
import type { CalendarDate } from "@/domain/calendar-date";
import { NEVER_VERIFIED } from "@/domain/ledger/verification";
import type { Money as MoneyValue } from "@/domain/money";
import { getAccountBalances, getPosition } from "@/server/services/ledger-service";
import { getAccountVerifications } from "@/server/services/reconciliation-service";
import { getAccountReferenceCounts, getAccounts } from "@/server/services/setup-service";

export const metadata: Metadata = { title: "Accounts" };

/**
 * The financial position right now, then the accounts it is made of and how
 * far each balance can be trusted. Every figure is the domain's; the
 * components only lay it out.
 */
export default async function AccountsPage() {
  const request = await getRequestContext();
  if (!request.ok) return null;
  const { ctx, today } = request;

  const accounts = await getAccounts(ctx);
  const [balances, position, references, verifications] = await Promise.all([
    getAccountBalances(ctx),
    getPosition(ctx),
    getAccountReferenceCounts(ctx),
    getAccountVerifications(
      ctx,
      accounts.map((a) => a.id),
    ),
  ]);

  const views: AccountView[] = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
    openedOn: account.openedOn as CalendarDate,
    balance: balances.find((b) => b.accountId === account.id)?.balance ?? (0 as MoneyValue),
    archived: account.archivedAt !== null,
    references: references.get(account.id) ?? 0,
    verification: verifications.get(account.id) ?? NEVER_VERIFIED,
  }));

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      {/* Phones too: New account stays on the title's line, so net worth comes up sooner. */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
        <h1 className="text-title font-bold text-navy">Accounts</h1>
        <div className="md:row-span-2">
          <NewAccountButton today={today} />
        </div>
        <p className="col-span-2 text-body text-ink-2 md:col-span-1">
          Your balances, and whether each still matches what you verified.
        </p>
      </header>

      <PositionSummary position={position} />

      <AccountList
        active={views.filter((a) => !a.archived)}
        archived={views.filter((a) => a.archived)}
        today={today}
      />
    </div>
  );
}
