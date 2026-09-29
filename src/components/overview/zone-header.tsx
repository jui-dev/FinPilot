import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";

/**
 * One header for each zone of the Overview's context column: its name, a
 * quieter line under it (the count, the period), and its one way on at the
 * right, so the three zones read with the same rhythm.
 */
export function ZoneHeader({
  id,
  title,
  note,
  action,
  focusable = false,
}: {
  readonly id: string;
  readonly title: string;
  readonly note?: ReactNode;
  readonly action?: ReactNode;
  /** The heading can take focus (when the element that had it is gone). */
  readonly focusable?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h2
          id={id}
          tabIndex={focusable ? -1 : undefined}
          className="text-heading font-bold text-navy outline-none"
        >
          {title}
        </h2>
        {note && <p className="mt-0.5 text-meta text-ink-2">{note}</p>}
      </div>
      {action}
    </div>
  );
}

/** A zone's way on to the page that explains it. */
export function ZoneLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 text-meta font-medium text-ocean max-md:min-h-10",
        linkClass,
      )}
    >
      {children}
      <ArrowRight aria-hidden className="size-3.5" />
    </Link>
  );
}
