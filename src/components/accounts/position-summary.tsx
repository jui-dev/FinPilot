import type { ReactNode } from "react";

import type { Position } from "@/domain/ledger/position";
import type { Money as MoneyValue } from "@/domain/money";

import { cn } from "../ui/cn";
import { Money } from "../ui/money";

/**
 * "What is my financial position right now?" The same card as Cash flow's and
 * Trends' totals: what you own, what you owe (or the credit a card holds) and,
 * on mist, net worth. Every figure is the domain's `Position`; nothing is
 * added up here. It says nothing about months or verification: Cash flow owns
 * movement, and the ledger below owns how far each balance can be trusted.
 */
export function PositionSummary({ position }: { readonly position: Position }) {
  // A card paid past zero holds credit: it is added, never shown as owed.
  const credit = position.liabilityStanding.kind === "credit";
  return (
    <section
      aria-labelledby="accounts-position"
      className="rounded-panel border border-line-soft bg-surface p-5 shadow-card md:p-7"
    >
      <h2 id="accounts-position" className="text-heading font-bold text-navy">
        Where you stand
      </h2>
      <p className="mt-1 text-meta text-ink-2">What you own, less what you owe, today.</p>

      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1.15fr)] lg:gap-2.5">
        <Part term="You own" amount={position.assets} sign="negative" />
        <Operator>{credit ? "+" : "−"}</Operator>
        <Part
          term={credit ? "Credit on cards" : "You owe"}
          amount={position.liabilityStanding.amount}
          sign="none"
        />
        <Operator>=</Operator>
        <div className="min-w-0 rounded-[12px] bg-mist/35 px-4 py-3.5 shadow-[inset_0_0_0_1px_rgb(70_103_141/0.14)]">
          <h3 className="text-micro font-semibold tracking-[0.08em] text-ocean uppercase">
            Net worth
          </h3>
          {/* Navy, with a true minus below zero. */}
          <p className="mt-1 text-figure font-bold whitespace-nowrap text-navy tabular-nums md:text-[2rem] md:leading-tight">
            <Money amount={position.netWorth} />
          </p>
        </div>
      </div>
    </section>
  );
}

function Part({
  term,
  amount,
  sign,
}: {
  readonly term: string;
  readonly amount: MoneyValue;
  /** Assets keep a true minus; the owed or credit magnitude takes its direction from the term. */
  readonly sign: "negative" | "none";
}) {
  return (
    <dl className="min-w-0 rounded-[12px] bg-surface-subtle px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--color-line-soft)]">
      <div>
        <dt className="text-micro font-semibold tracking-[0.08em] text-ink-2 uppercase">{term}</dt>
        <dd className="mt-1 text-figure font-bold whitespace-nowrap text-navy tabular-nums md:text-[2rem] md:leading-tight">
          <Money amount={amount} sign={sign} />
        </dd>
      </div>
    </dl>
  );
}

/** The operator between two parts: a chip in the gap from 1024px, hidden when the parts stack. */
function Operator({ children }: { readonly children: ReactNode }) {
  return (
    <div aria-hidden className={cn("grid place-items-center max-lg:hidden")}>
      <span className="grid size-7 place-items-center rounded-full bg-surface text-body font-bold text-ink-2 shadow-[0_0_0_1px_var(--color-line),0_2px_6px_rgb(31_56_90/0.08)]">
        {children}
      </span>
    </div>
  );
}
