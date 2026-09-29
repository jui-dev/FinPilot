"use client";

import { useState, type ReactNode } from "react";

import { Button } from "../ui/button";
import { SidePanel } from "../ui/overlay";
import { countLine } from "./describe";

/** The heading inside the sheet: it names the list and takes focus after Hide. */
export const SHEET_HEADING_ID = "attention-sheet-count";

/**
 * How the Overview reaches the complete list: **View all N** when there are
 * more signals than the preview shows; **Open Attention** when the preview
 * shows them all but one can be hidden (Hide lives only in the sheet); nothing
 * otherwise.
 */
export type SheetAction = "view-all" | "open" | null;

/**
 * The complete Attention list, with Hide, in a side panel (a bottom sheet on
 * phones). The list arrives rendered from the server, so after Hide or Undo it
 * is refreshed with the page. It is not a route and not an inbox.
 *
 * The button stays while the sheet is open, so closing it returns focus there.
 * If hiding inside the sheet removed the reason for the button, closing the
 * sheet puts focus on the zone's heading (`fallbackFocusId`) instead.
 */
export function AttentionSheet({
  count,
  action,
  fallbackFocusId,
  list,
}: {
  readonly count: number;
  readonly action: SheetAction;
  /** Takes focus on close when the button is no longer offered. */
  readonly fallbackFocusId: string;
  /** The complete list, labelled by SHEET_HEADING_ID. */
  readonly list: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (action === null && !open) return null;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    // Runs before the overlay's own return of focus, which finds its opener gone.
    if (!next && action === null) {
      window.setTimeout(() => document.getElementById(fallbackFocusId)?.focus(), 0);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" className="max-md:h-10" onClick={() => setOpen(true)}>
        {action === "view-all" ? `View all ${count}` : "Open Attention"}
      </Button>
      <SidePanel
        open={open}
        onOpenChange={onOpenChange}
        title="Attention"
        description="Everything that needs a look right now, most urgent first."
      >
        <h3
          id={SHEET_HEADING_ID}
          tabIndex={-1}
          className="text-body font-semibold text-ink-2 outline-none focus-visible:outline-2"
        >
          {count === 0 ? "Nothing needs a look" : countLine(count)}
        </h3>
        {list}
      </SidePanel>
    </>
  );
}
