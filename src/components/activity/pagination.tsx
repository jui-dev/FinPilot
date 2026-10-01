import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { cn } from "../ui/cn";

/** How many transactions a page shows. */
export const PAGE_SIZE = 25;

/**
 * The page numbers to offer: always the first and last, the current one with
 * a neighbour either side, and a gap ("…") wherever pages are skipped.
 */
export function pageList(current: number, total: number): (number | "gap")[] {
  const wanted = new Set([1, total, current - 1, current, current + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  pages.forEach((p, i) => {
    const previous = pages[i - 1];
    if (previous !== undefined && p - previous > 1) out.push(p - previous === 2 ? p - 1 : "gap");
    out.push(p);
  });
  return out;
}

/**
 * The list's pages, under the rows: where this page sits in the whole view
 * ("26–50 of 474 entries"), then Previous, the page numbers and Next. Links, so each
 * page has its own URL; the filters stay as they are.
 */
export function Pagination({
  page,
  pages,
  total,
  hrefFor,
}: {
  readonly page: number;
  readonly pages: number;
  /** Every entry in the view, across all pages. */
  readonly total: number;
  readonly hrefFor: (page: number) => string;
}) {
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  return (
    <nav
      aria-label="Pages"
      className="flex flex-col items-center gap-3 border-t border-line-soft bg-[linear-gradient(90deg,var(--color-surface-subtle)_0%,var(--color-surface)_100%)] px-4 py-3.5 sm:flex-row sm:justify-between md:px-5"
    >
      {/* Not "Showing …": that is the list's heading, above. */}
      <p className="text-meta text-ink-2">
        <span className="font-semibold text-ink tabular-nums">
          {first}–{last}
        </span>{" "}
        of <span className="font-semibold text-ink tabular-nums">{total}</span>{" "}
        {total === 1 ? "entry" : "entries"}
      </p>
      {pages > 1 && (
        <ul className="flex items-center gap-1">
          <li>
            <Step href={page > 1 ? hrefFor(page - 1) : null} label="Previous page">
              <ChevronLeft aria-hidden className="size-4" />
              <span className="max-sm:sr-only">Previous</span>
            </Step>
          </li>
          {pageList(page, pages).map((p, i) =>
            p === "gap" ? (
              <li key={`gap${i}`} aria-hidden className="grid w-6 place-items-center text-ink-3">
                …
              </li>
            ) : (
              <li key={p}>
                <Link
                  href={hrefFor(p)}
                  scroll
                  aria-label={`Page ${p}`}
                  aria-current={p === page ? "page" : undefined}
                  className={cn(
                    "grid h-8 min-w-8 place-items-center rounded-control px-2 text-meta font-semibold tabular-nums transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean",
                    p === page
                      ? "bg-mist text-ocean shadow-[inset_0_0_0_1px_var(--color-ocean)]"
                      : "text-ink-2 hover:bg-surface-hover hover:text-ink",
                  )}
                >
                  {p}
                </Link>
              </li>
            ),
          )}
          <li>
            <Step href={page < pages ? hrefFor(page + 1) : null} label="Next page">
              <span className="max-sm:sr-only">Next</span>
              <ChevronRight aria-hidden className="size-4" />
            </Step>
          </li>
        </ul>
      )}
    </nav>
  );
}

function Step({
  href,
  label,
  children,
}: {
  readonly href: string | null;
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  const className =
    "inline-flex h-8 items-center gap-1 rounded-control px-2.5 text-meta font-semibold transition-colors";
  if (!href) {
    return (
      <span aria-disabled="true" aria-label={label} className={cn(className, "text-ink-3")}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        className,
        "text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean",
      )}
    >
      {children}
    </Link>
  );
}
