import type { ReactNode } from "react";

import type { Position } from "@/domain/ledger/position";

import { accountIcon, Glyph } from "../ledger/icons";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { standing, type OweLine, type StandingAccount } from "./describe";
import { ZoneHeader, ZoneLink } from "./zone-header";

/**
 * "What am I worth, and why?" — Net worth first, in its own card; beside it a
 * balance statement read top to bottom: You own (the accounts as evidence),
 * − You owe (a soft berry: the liability family, not a warning), = Net worth
 * on a navy rule. Nothing is drawn to scale; every total is the position's
 * and the accounts are listed as they stand. Net worth stays navy, with a
 * true minus when below zero. Liquidity is Available's question, not this one's.
 */
export function WhereYouStand({
  position,
  accounts,
}: {
  readonly position: Position;
  readonly accounts: readonly StandingAccount[];
}) {
  const { own, owe } = standing(accounts);
  const owes = position.liabilityStanding;
  const credit = owes.kind === "credit";
  const berry = owe.some((l) => l.kind === "owed") && !credit;
  return (
    <section
      aria-labelledby="overview-stand"
      className="rounded-panel border border-line bg-surface p-5 shadow-card md:p-7"
    >
      <ZoneHeader
        id="overview-stand"
        title="Where you stand"
        action={<ZoneLink href="/accounts">Your accounts</ZoneLink>}
      />
      <div className="mt-4 grid gap-4 md:mt-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
        {/* The answer. */}
        <div className="flex flex-col justify-center rounded-2xl bg-[radial-gradient(120%_120%_at_0%_0%,color-mix(in_srgb,var(--color-mist)_55%,transparent)_0%,transparent_60%)] px-5 py-6 shadow-[inset_0_0_0_1px_var(--color-line)] md:px-8 md:py-9">
          <p className="text-body font-semibold text-navy">Net worth</p>
          <p className="mt-1.5 text-[clamp(2.75rem,5.5vw,4.25rem)] leading-none font-extrabold tracking-[-0.035em] whitespace-nowrap text-navy tabular-nums">
            <Money amount={position.netWorth} />
          </p>
          <p className="mt-4 text-body text-ink-2">
            Everything you own, less what you owe.
            <span className="max-lg:hidden">
              <br />
              You own <Money amount={position.assets} className="font-semibold text-ink" />
              {credit ? (
                <>
                  {" "}
                  and cards hold{" "}
                  <Money amount={owes.amount} sign="none" className="font-semibold text-ink" /> of
                  credit.
                </>
              ) : (
                <>
                  {" "}
                  and owe{" "}
                  <Money
                    amount={owes.amount}
                    sign="none"
                    className={cn("font-semibold", berry ? "text-negative" : "text-ink")}
                  />
                  .
                </>
              )}
            </span>
          </p>
        </div>

        {/* The statement: You own − You owe = Net worth. */}
        <div className="min-w-0">
          <div className="rounded-[14px] bg-mist/25 p-3.5 shadow-[inset_0_0_0_1px_rgb(70_103_141/0.14)] md:px-5 md:py-4.5">
            <Total
              term="You own"
              amount={<Money amount={position.assets} />}
              className="text-ocean"
            />
            {own.length > 0 ? (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {own.map((a) => (
                  <AccountCard key={a.accountId} account={a} />
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-meta text-ink-2">No accounts hold money yet.</p>
            )}
          </div>

          <Operator>{credit ? "+" : "−"}</Operator>

          <div
            className={cn(
              "rounded-[14px] p-3.5 md:px-5 md:py-4.5",
              berry
                ? "bg-negative-soft shadow-[inset_0_0_0_1.5px_rgb(163_58_98/0.45)]"
                : "bg-surface-subtle shadow-[inset_0_0_0_1px_var(--color-line)]",
            )}
          >
            <Total
              term={credit ? "Credit on cards" : "You owe"}
              amount={<Money amount={owes.amount} sign="none" />}
              className={berry ? "text-negative" : "text-ink-2"}
              figureClassName={berry ? "text-negative" : undefined}
            />
            {owe.length > 0 ? (
              <ul className="mt-3 grid gap-2">
                {owe.map((l) => (
                  <OweCard key={l.accountId} line={l} />
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-meta text-ink-2">Nothing is owed on cards.</p>
            )}
          </div>

          <div className="mt-3.5 flex items-baseline justify-between gap-4 border-t-2 border-navy px-3.5 pt-3.5 md:px-5">
            <p className="text-body font-bold text-navy">= Net worth</p>
            <Money
              amount={position.netWorth}
              className="text-figure font-extrabold whitespace-nowrap text-navy tabular-nums md:text-[1.5rem]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Total({
  term,
  amount,
  className,
  figureClassName,
}: {
  readonly term: string;
  readonly amount: ReactNode;
  readonly className: string;
  readonly figureClassName?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <p className={cn("text-micro font-bold tracking-[0.08em] uppercase", className)}>{term}</p>
      <p
        className={cn(
          "text-figure font-bold whitespace-nowrap text-ink tabular-nums md:text-[1.5rem]",
          figureClassName,
        )}
      >
        {amount}
      </p>
    </div>
  );
}

/** The operator between the two sides, as a chip across the gap. */
function Operator({ children }: { readonly children: ReactNode }) {
  return (
    <div aria-hidden className="relative h-3.5">
      <span className="absolute top-1/2 left-1/2 z-10 grid size-7.5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-surface text-body text-ink-2 shadow-[0_0_0_1px_var(--color-line),0_2px_6px_rgb(31_56_90/0.08)]">
        {children}
      </span>
    </div>
  );
}

const CARD = "flex items-center gap-2.5 rounded-[10px] bg-surface px-3 py-2.5";

function AccountCard({ account }: { readonly account: StandingAccount }) {
  return (
    <li className={cn(CARD, "shadow-[inset_0_0_0_1px_rgb(70_103_141/0.16)]")}>
      <Glyph icon={accountIcon(account.type)} tone="info" />
      <span className="min-w-0 flex-1 truncate text-body font-semibold text-ink">
        {account.name}
        {account.archived && <span className="font-normal text-ink-2"> (archived)</span>}
      </span>
      <Money
        amount={account.balance}
        className="text-body font-bold whitespace-nowrap text-ink tabular-nums"
      />
    </li>
  );
}

/** A card that owes is berry on white; a card holding credit is neutral, with a plus. */
function OweCard({ line }: { readonly line: OweLine }) {
  const owed = line.kind === "owed";
  return (
    <li
      className={cn(
        CARD,
        owed
          ? "shadow-[inset_0_0_0_1px_rgb(163_58_98/0.22)]"
          : "shadow-[inset_0_0_0_1px_var(--color-line)]",
      )}
    >
      <Glyph
        icon={accountIcon("credit_card")}
        tone="info"
        className={owed ? "bg-negative-soft text-negative" : undefined}
      />
      <span className="min-w-0 flex-1 truncate text-body font-semibold text-ink">
        {line.name}
        {line.archived && <span className="font-normal text-ink-2"> (archived)</span>}
      </span>
      <span
        className={cn(
          "text-body font-bold whitespace-nowrap tabular-nums",
          owed ? "text-negative" : "text-ink",
        )}
      >
        <Money amount={line.amount} sign={owed ? "none" : "always"} />
        {!owed && <span className="font-normal text-ink-2"> credit</span>}
      </span>
    </li>
  );
}
