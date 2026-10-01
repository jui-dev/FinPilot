"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { cn } from "../ui/cn";
import { PAGE_ICONS, SECTION_ICONS } from "./nav-icons";
import { isActive, type NavSection } from "./navigation";

/**
 * The row under the header inside a section with several pages: the section's
 * name, then its pages, the current one a raised white chip. Part of the
 * shell, not the page, so it never sits among a page's own controls. On a
 * phone the icons drop so the longest section (Plan) fits at 390px; narrower
 * still, it scrolls sideways and starts with the current page in view.
 */
export function SectionNav({
  section,
  pathname,
  className,
}: {
  readonly section: NavSection;
  readonly pathname: string;
  /** The shell's width and gutters. */
  readonly className: string;
}) {
  const row = useRef<HTMLDivElement>(null);
  const SectionIcon = SECTION_ICONS[section.label];

  useEffect(() => {
    const container = row.current;
    const current = container?.querySelector<HTMLElement>("[aria-current='page']");
    if (!container || !current) return;
    const end = current.offsetLeft + current.offsetWidth;
    if (end > container.clientWidth) container.scrollLeft = end - container.clientWidth + 16;
  }, [pathname]);

  return (
    <nav aria-label={section.label} className="border-b border-line bg-surface-subtle">
      <div
        ref={row}
        className={cn(
          className,
          // relative: the current page's offsetLeft is measured from this row.
          "relative flex h-12 items-center gap-1 overflow-x-auto scrollbar-none",
        )}
      >
        <span className="mr-1 flex h-5 shrink-0 items-center gap-1.5 border-r border-line pr-3 text-body sm:mr-1.5 sm:pr-3.5 font-semibold whitespace-nowrap text-navy">
          {SectionIcon && (
            <SectionIcon
              aria-hidden
              className="size-4 text-ocean max-sm:hidden"
              strokeWidth={1.75}
            />
          )}
          {section.label}
        </span>
        {section.pages.map((page) => {
          const current = isActive(pathname, page.href);
          const Icon = PAGE_ICONS[page.href];
          return (
            <Link
              key={page.href}
              href={page.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-control px-2.5 text-body whitespace-nowrap transition-colors sm:px-3",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ocean",
                current
                  ? "bg-surface font-semibold text-navy shadow-chip"
                  : "font-medium text-ink-2 hover:bg-surface-hover hover:text-ink",
              )}
            >
              {Icon && (
                <Icon
                  aria-hidden
                  className={cn("size-4 max-sm:hidden", current && "text-ocean")}
                  strokeWidth={1.75}
                />
              )}
              {page.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
