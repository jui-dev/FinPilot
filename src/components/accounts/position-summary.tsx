import { HandCoins, Wallet, type LucideIcon } from "lucide-react";

import type { Position } from "@/domain/ledger/position";
import type { Money as MoneyValue } from "@/domain/money";

import { cn } from "../ui/cn";
import { Money } from "../ui/money";

/**
 * "What is my financial position right now?" — net worth, and the two figures
 * it is made of. Every figure is the domain's `Position`; nothing is added up
 * here. It says nothing about months, trends or verification: Cash flow owns
 * movement, and the ledger below owns how far each balance can be trusted.
 */
export function PositionSummary({ position }: { readonly position: Position }) {
  return (
    <section
      aria-labelledby="accounts-net-worth"
      className="grid overflow-clip rounded-panel border border-line bg-surface shadow-card md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
    >
      <div className="bg-mist px-5 py-5 md:px-7 md:py-6">
        <h2 id="accounts-net-worth" className="text-body font-semibold text-navy">
          Net worth
        </h2>
        <p className="mt-1 text-display font-bold text-navy">
          <Money amount={position.netWorth} />
        </p>
        <p className="mt-1 text-body text-ink-2">What you own minus what you owe</p>
      </div>
      {/* Phones: the two parts side by side under net worth. md and up: stacked beside it. */}
      <dl className="grid grid-cols-2 divide-x divide-line border-t border-line md:grid-cols-1 md:divide-x-0 md:divide-y md:border-t-0 md:border-l">
        <Part term="Own" icon={Wallet} amount={position.assets} />
        <Part term="Owe" icon={HandCoins} amount={position.liabilities} />
      </dl>
    </section>
  );
}

function Part({
  term,
  icon: Icon,
  amount,
}: {
  readonly term: string;
  readonly icon: LucideIcon;
  /** A magnitude: assets, or the amount owed as a positive number. */
  readonly amount: MoneyValue;
}) {
  return (
    <div
      className={cn(
        // Phones: label over amount. md and up: one row, label left, amount right.
        "flex min-w-0 flex-col gap-2 px-4 py-4 md:flex-row md:items-center md:justify-between md:gap-4 md:px-6",
      )}
    >
      <dt className="flex items-center gap-2 text-body font-semibold text-ink-2">
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-mist text-ocean"
        >
          <Icon className="size-4" strokeWidth={2} />
        </span>
        {term}
      </dt>
      <dd className="text-figure font-bold text-navy">
        <Money amount={amount} sign="none" />
      </dd>
    </div>
  );
}
