import type { ReactNode } from "react";

import { getRequestContext } from "@/app/_server/context";
import { AppShell } from "@/components/shell/app-shell";
import { SetupRequired } from "@/components/shell/setup-required";
import { ZERO } from "@/domain/money";
import { getEntryDefaults } from "@/server/services/activity-service";
import { getAccountBalances } from "@/server/services/ledger-service";
import { getAccounts, getCategories } from "@/server/services/setup-service";

/**
 * The ledger frame. It loads what Quick Add needs everywhere (active accounts
 * with their balances, active categories, remembered defaults) and shows the
 * setup screen when the local database is not ready.
 */
export default async function LedgerLayout({ children }: { readonly children: ReactNode }) {
  const request = await getRequestContext();
  if (!request.ok) return <SetupRequired problem={request.problem} />;

  const { ctx, today } = request;
  const [accounts, balances, categories, defaults] = await Promise.all([
    getAccounts(ctx),
    getAccountBalances(ctx),
    getCategories(ctx),
    getEntryDefaults(ctx),
  ]);

  const activeCategories = categories.filter((c) => c.archivedAt === null);
  return (
    <AppShell
      today={today}
      quickAdd={{
        accounts: accounts
          .filter((a) => a.archivedAt === null)
          .map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            balance: balances.find((b) => b.accountId === a.id)?.balance ?? ZERO,
          })),
        categories: activeCategories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
        defaults,
        today,
      }}
    >
      {children}
    </AppShell>
  );
}
