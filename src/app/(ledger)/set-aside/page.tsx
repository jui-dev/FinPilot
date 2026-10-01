import type { Metadata } from "next";

import { getRequestContext } from "@/app/_server/context";
import { CARD } from "@/components/commitments/occurrence-list";
import { holdingsByAccount } from "@/components/set-aside/describe";
import { ArchivedItems, ItemList, type ItemRow } from "@/components/set-aside/item-list";
import { NewPurposeButton, type Source } from "@/components/set-aside/panels";
import { SetAsideSummary } from "@/components/set-aside/summary";
import { EmptyState } from "@/components/ui/panel";
import { getItems, getReserveSources } from "@/server/services/protected-money-service";
import { getAccounts } from "@/server/services/setup-service";

export const metadata: Metadata = { title: "Set aside" };

/**
 * "What am I keeping money for, how much is really there, and where is it?"
 * Set aside is money in the person's own accounts kept apart for a purpose.
 * Nothing moves and no transaction is recorded; every figure — what is
 * covered, what is short, what is still needed — is derived by the service.
 */
export default async function SetAsidePage() {
  const request = await getRequestContext();
  if (!request.ok) return null;
  const { ctx } = request;

  const [items, reserveSources, accounts] = await Promise.all([
    getItems(ctx),
    getReserveSources(ctx),
    getAccounts(ctx),
  ]);

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const sources: Source[] = reserveSources.map((s) => ({
    accountId: s.accountId,
    name: s.name,
    free: s.reservable,
  }));
  const active: ItemRow[] = items
    .filter((i) => !i.archived)
    .map((i) => ({
      id: i.id,
      name: i.name,
      target: i.cover.target,
      setAside: i.cover.reserved,
      cover: i.cover,
      holdings: i.earmarks.map((e) => ({
        accountId: e.accountId,
        accountName: accountName.get(e.accountId) ?? "",
        setAside: e.reserved,
        short: e.short,
      })),
    }));
  const archived = items
    .filter((i) => i.archived)
    .map((i) => ({ id: i.id, name: i.name, target: i.cover.target }));

  const types = new Map(accounts.map((a) => [a.id, a.type]));
  const free = new Map(reserveSources.map((s) => [s.accountId, s.reservable]));

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <header>
          <h1 className="text-title font-bold text-navy">Set aside</h1>
          <p className="mt-1 text-body text-ink-2">
            Money in your accounts you&apos;re keeping for something. It stays where it is — nothing
            moves.
          </p>
        </header>
        <div className="flex flex-wrap items-center gap-3">
          <NewPurposeButton emphasized />
        </div>
      </div>

      {active.length === 0 ? (
        <section className={CARD} aria-label="Set aside">
          <EmptyState title="Nothing set aside yet">
            Keep part of the money in your accounts for something — a laptop, an emergency fund,
            tuition. It stays in the account; FinPilot keeps track of it and shows if a balance
            falls below it.
          </EmptyState>
        </section>
      ) : (
        <>
          <SetAsideSummary
            covers={active.map((i) => i.cover)}
            accounts={holdingsByAccount(active)}
            free={free}
            types={types}
          />
          <ItemList items={active} sources={sources} types={types} />
        </>
      )}

      <ArchivedItems items={archived} />
    </div>
  );
}
