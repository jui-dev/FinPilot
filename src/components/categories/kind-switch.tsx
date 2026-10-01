import Link from "next/link";

import type { CategoryKind } from "@/domain/ledger/transactions";

import { cn } from "../ui/cn";
import { KIND_WORDS } from "./describe";
import { KIND_STYLE } from "./kind-style";

/** Expense first, as in Quick Add. */
const KINDS: readonly CategoryKind[] = ["expense", "income"];

/**
 * Expense Categories | Income Categories: one page, two lists. Links, so each
 * kind has its own URL (expense at the bare path). Each option carries its
 * kind's mark (warm, money out; cool, money in) and the chosen one takes its
 * kind's tint, so the kind on screen is plain at a glance; the words still
 * carry it on their own. Sized like the other page controls (h-8).
 */
export function KindSwitch({ current }: { readonly current: CategoryKind }) {
  return (
    <nav aria-label="Category kind" className="-mb-1">
      <ul className="inline-flex rounded-control border border-line bg-surface-subtle p-0.5">
        {KINDS.map((kind) => {
          const selected = kind === current;
          const style = KIND_STYLE[kind];
          return (
            <li key={kind}>
              <Link
                href={kind === "expense" ? "/categories" : "/categories?kind=income"}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-[6px] pr-3 pl-1.5 text-body font-medium whitespace-nowrap transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-ocean",
                  selected ? style.selected : "text-ink-2 hover:text-ink",
                )}
              >
                {/* Each kind keeps its mark whether chosen or not, so both read at a glance. */}
                <span
                  aria-hidden
                  className={cn("grid size-5 shrink-0 place-items-center rounded-full", style.mark)}
                >
                  <style.icon className="size-3" strokeWidth={2.25} />
                </span>
                {KIND_WORDS[kind].title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
