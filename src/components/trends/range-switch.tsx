import Link from "next/link";

import { DEFAULT_TREND_LENGTH, TREND_LENGTHS, type TrendLength } from "@/domain/ledger/trends";

import { cn } from "../ui/cn";

/**
 * How many complete months Trends covers: 6 or 12. Links, so each length has
 * its own URL; the default lives at the bare path.
 */
export function RangeSwitch({ current }: { readonly current: TrendLength }) {
  return (
    <nav aria-label="Months covered">
      <ul className="inline-flex rounded-control border border-line bg-surface p-0.5">
        {TREND_LENGTHS.map((length) => {
          const selected = length === current;
          return (
            <li key={length}>
              <Link
                href={length === DEFAULT_TREND_LENGTH ? "/trends" : `/trends?range=${length}`}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex h-8 items-center rounded-[6px] px-3 text-body font-medium whitespace-nowrap transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-ocean",
                  selected
                    ? "bg-mist text-ocean shadow-[0_0_0_1px_var(--color-ocean)]"
                    : "text-ink-2 hover:text-ink",
                )}
              >
                {length} months
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
