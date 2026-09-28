import Link from "next/link";

import { cn } from "../ui/cn";

/**
 * The interim switch between the two pages of the forward-looking area,
 * Commitments and Set aside, until Stage 8 names the area and decides its
 * navigation (roadmap §8.3, open decisions P-2/P-3). Links, not tabs: each
 * page has its own URL, and the global Commitments destination stays current
 * on both.
 */
const PAGES = [
  { href: "/commitments", label: "Commitments" },
  { href: "/set-aside", label: "Set aside" },
] as const;

export function AreaSwitch({ current }: { readonly current: (typeof PAGES)[number]["href"] }) {
  return (
    <nav aria-label="Commitments and Set aside" className="-mb-1">
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
