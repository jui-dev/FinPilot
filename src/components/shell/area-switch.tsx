import Link from "next/link";

import { cn } from "../ui/cn";

/**
 * The switch between the pages of the Available area (roadmap §8.3, P-2):
 * Available leads, and Commitments and Set aside are its inputs. Links, not
 * tabs: each page has its own URL, and the global Available destination stays
 * current on all three.
 */
const PAGES = [
  { href: "/available", label: "Available" },
  { href: "/commitments", label: "Commitments" },
  { href: "/set-aside", label: "Set aside" },
] as const;

export function AreaSwitch({ current }: { readonly current: (typeof PAGES)[number]["href"] }) {
  return (
    <nav aria-label="Available" className="-mb-1">
      <ul className="inline-flex rounded-control border border-line bg-surface-subtle p-0.5">
        {PAGES.map((page) => {
          const selected = page.href === current;
          return (
            <li key={page.href}>
              <Link
                href={page.href}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center rounded-[6px] px-3 text-body font-medium whitespace-nowrap transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-ocean",
                  selected
                    ? "bg-mist text-ocean shadow-[0_0_0_1px_var(--color-ocean)]"
                    : "text-ink-2 hover:text-ink",
                )}
              >
                {page.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
