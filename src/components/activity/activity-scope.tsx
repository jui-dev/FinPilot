import Link from "next/link";

import type { Money as MoneyValue } from "@/domain/money";

import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";

/**
 * What the list and its totals cover. The evidence a Cash flow figure or a
 * verification links to lands here, so the scope is the list's heading, and
 * the totals are the service's, over exactly the rows shown.
 */
export function ActivityScope({
  id,
  scope,
  count,
  filtering,
  spending,
  income,
  cashFlow,
}: {
  /** Referenced by the workspace's `aria-labelledby`. */
  readonly id: string;
  readonly scope: readonly string[];
  readonly count: number;
  readonly filtering: boolean;
  /** Expenses net of refunds: negative when refunds outweigh spending. */
  readonly spending: MoneyValue;
  readonly income: MoneyValue;
  /** The Cash flow month this view has the shape of, when it has one. */
  readonly cashFlow: { readonly href: string; readonly label: string } | null;
}) {
  return (
    <div className="flex flex-col gap-2 bg-mist/45 px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-x-8 md:px-5 md:py-3.5">
      <div className="min-w-0">
        <h2 id={id} className="text-heading font-bold text-navy">
          Showing <span>{scope.join(" · ")}</span>
        </h2>
        <p className="mt-0.5 text-meta text-ink-2">
          {count} {count === 1 ? "entry" : "entries"}
          {filtering ? " in this view" : ""}
          {cashFlow && (
            <>
              {" · "}
              <Link
                href={cashFlow.href}
                className={cn("font-medium whitespace-nowrap text-ink", linkClass)}
              >
                Open {cashFlow.label} in Cash flow
              </Link>
            </>
          )}
        </p>
      </div>
      {/* Each label shares its element with its amount, so the pair reads as one. */}
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-6 gap-y-1 text-body text-ink-2">
        <p>
          Spent{" "}
          <Money
            amount={spending}
            sign="negative"
            className="ml-1 text-heading font-bold text-navy"
          />
        </p>
        <p>
          Income{" "}
          <Money amount={income} sign="none" className="ml-1 text-heading font-bold text-navy" />
        </p>
      </div>
    </div>
  );
}
