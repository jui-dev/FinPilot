"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "../ui/button";

/**
 * The first `initial` rows, and the rest in place behind **Show N more**
 * (then **Show fewer**). The rows arrive rendered and in order; this only
 * decides how many are shown. The state is not stored or put in the URL.
 */
export function ShowMoreList({
  id,
  initial,
  children,
}: {
  /** The list's id, which the button controls. */
  readonly id: string;
  readonly initial: number;
  /** Keyed list items, in order. */
  readonly children: readonly ReactNode[];
}) {
  const [open, setOpen] = useState(false);
  const more = children.length - initial;
  return (
    <>
      <ul id={id} className="divide-y divide-line">
        {open || more <= 0 ? children : children.slice(0, initial)}
      </ul>
      {more > 0 && (
        <div className="border-t border-line px-2 py-1.5 md:px-3">
          <Button
            variant="ghost"
            size="sm"
            className="max-md:h-10"
            aria-expanded={open}
            aria-controls={id}
            icon={
              open ? (
                <ChevronUp aria-hidden className="size-4" />
              ) : (
                <ChevronDown aria-hidden className="size-4" />
              )
            }
            onClick={() => setOpen(!open)}
          >
            {open ? "Show fewer" : `Show ${more} more`}
          </Button>
        </div>
      )}
    </>
  );
}
