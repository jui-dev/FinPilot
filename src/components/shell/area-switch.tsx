import Link from "next/link";

import { cn } from "../ui/cn";

/**
 * A local switch between the pages of one area. Links, not tabs: each page has
 * its own URL, and the area's global destination stays current on all of them.
 */
export interface Area {
  /** Names the switch for assistive technology. */
  readonly label: string;
  readonly pages: readonly { readonly href: string; readonly label: string }[];
}

/** The forward-looking area (roadmap §8.3, P-2): Available leads, Commitments and Set aside are its inputs. */
export const AVAILABLE_AREA: Area = {
  label: "Available",
  pages: [
    { href: "/available", label: "Available" },
    { href: "/commitments", label: "Commitments" },
    { href: "/set-aside", label: "Set aside" },
  ],
};

/** One month's cash flow, its shape across complete months (Trends), and when money moved (Calendar). */
export const CASH_FLOW_AREA: Area = {
  label: "Cash flow",
  pages: [
    { href: "/cash-flow", label: "Cash flow" },
    { href: "/trends", label: "Trends" },
    { href: "/calendar", label: "Calendar" },
  ],
};

export function AreaSwitch({ area, current }: { readonly area: Area; readonly current: string }) {
  return (
    <nav aria-label={area.label} className="-mb-1">
      <ul className="inline-flex rounded-control border border-line bg-surface-subtle p-0.5">
        {area.pages.map((page) => {
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
