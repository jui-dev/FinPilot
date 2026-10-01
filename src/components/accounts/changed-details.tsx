"use client";

import { ChevronRight, CircleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "../ui/button";
import { Modal } from "../ui/overlay";

/**
 * A changed checkpoint, kept to its tag in the row: the tag is a button, and
 * what changed (the two amounts compared, and the entries to review) opens in
 * a dialog, so the row stays one line like every other.
 */
export function ChangedDetails({
  label,
  title,
  children,
}: {
  /** The tag's words ("Changed · ৳2,500 off"). */
  readonly label: ReactNode;
  /** The dialog's title ("Cash has changed since 19 Sep"). */
  readonly title: string;
  /** The evidence, rendered by the list. */
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex h-6 items-center gap-1 rounded-full bg-surface px-2 text-micro font-semibold whitespace-nowrap text-warning shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors hover:bg-surface-subtle hover:shadow-[inset_0_0_0_1px_var(--color-warning)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean"
      >
        <CircleAlert aria-hidden className="size-3.5" />
        <span>{label}</span>
        <ChevronRight aria-hidden className="size-3.5 opacity-70" />
        <span className="sr-only">: see what changed</span>
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={title}
        footer={
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      >
        {children}
      </Modal>
    </>
  );
}
