import type { Metadata } from "next";

import { getRequestContext } from "@/app/_server/context";
import { CARD } from "@/components/commitments/occurrence-list";
import { summary } from "@/components/set-aside/describe";
import { ArchivedItems, ItemList, type ItemRow } from "@/components/set-aside/item-list";
import { NewPurposeButton, type Source } from "@/components/set-aside/panels";
import { AreaSwitch } from "@/components/shell/area-switch";
import { Money } from "@/components/ui/money";
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

  const total = summary(active.map((i) => i.cover));

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <AreaSwitch current="/set-aside" />
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
        <h1 className="text-title font-bold text-navy">Set aside</h1>
        <div className="md:row-span-2">
          <NewPurposeButton emphasized={active.length === 0} />
        </div>
        <p className="col-span-2 text-body text-ink-2 md:col-span-1">
          Money in your accounts you&apos;re keeping for something. It stays where it is — nothing
          moves.
        </p>
      </header>

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
          {active.length > 1 && total.kind !== "empty" && (
            <p className="text-body text-ink-2">
              {total.kind === "covered" ? (
                <>
                  <Money amount={total.setAside} sign="none" className="font-semibold text-ink" />{" "}
                  set aside in total.
                </>
              ) : (
                <>
                  <Money amount={total.covered} sign="none" className="font-semibold text-ink" /> of{" "}
                  <Money amount={total.setAside} sign="none" /> still covered ·{" "}
                  <span className="text-negative">
                    <Money amount={total.short} sign="none" /> short
                  </span>
                </>
              )}
            </p>
          )}
          <ItemList items={active} sources={sources} />
        </>
      )}

      <ArchivedItems items={archived} />
    </div>
  );
}
