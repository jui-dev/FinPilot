"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type FocusEvent, type ReactNode } from "react";

import { cn } from "./cn";
import { isInToastRegion } from "./toast";

/**
 * Overlays built on Radix Dialog (focus trap, Escape, aria wiring); the look is
 * FinPilot's own. On phones every overlay becomes a bottom sheet.
 *
 * - Modal: a centred dialog (Quick Add, confirmations).
 * - SidePanel: a right-hand panel for editing without leaving the page.
 *
 * Both are opened by their callers' state rather than a Radix Trigger, so each
 * remembers what had focus when it opened and returns focus there when it
 * closes (useOverlayFocus). A toast is not "outside" an overlay: using its
 * Undo never closes the overlay that is open.
 */

interface OverlayProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Visually hide the title (it is still announced). */
  readonly hideTitle?: boolean;
  readonly header?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly className?: string;
  readonly onOpenAutoFocus?: (event: Event) => void;
}

const overlayClass = "fixed inset-0 z-40 bg-ink/30 animate-fade-in";

/**
 * Focus returns to the element that had it when the overlay opened, if that
 * element is still in the document. Radix returns focus only to a Dialog.Trigger,
 * which these overlays don't use; without an opener (Quick Add opened with the
 * N key, say) or once the opener is gone, focus is left where Radix leaves it.
 *
 * The opener is the element the first focus inside the overlay came from. That
 * holds however focus arrives: Radix's own, the caller's onOpenAutoFocus, or a
 * field's autoFocus (which makes Radix skip its open event altogether).
 */
function useOverlayFocus() {
  // undefined: not yet known for this opening; null: nothing outside had focus.
  const opener = useRef<HTMLElement | null | undefined>(undefined);
  return {
    onFocusCapture: (event: FocusEvent<HTMLElement>) => {
      if (opener.current !== undefined) return;
      const from = event.relatedTarget;
      opener.current =
        from instanceof HTMLElement && !event.currentTarget.contains(from) ? from : null;
    },
    onCloseAutoFocus: (event: Event) => {
      const element = opener.current;
      opener.current = undefined;
      if (element?.isConnected) {
        event.preventDefault();
        element.focus();
      }
    },
    // The toast (and its Undo) sits outside the overlay's portal; using it is not dismissing.
    onInteractOutside: (event: Event) => {
      if (isInToastRegion(event.target)) event.preventDefault();
    },
  };
}

function Close() {
  return (
    <Dialog.Close
      className="grid size-8 shrink-0 place-items-center rounded-control text-ink-3 transition-colors hover:bg-surface-hover hover:text-ink"
      aria-label="Close"
    >
      <X className="size-4.5" strokeWidth={1.75} />
    </Dialog.Close>
  );
}

function Frame({
  title,
  description,
  hideTitle,
  header,
  children,
  footer,
}: Omit<OverlayProps, "open" | "onOpenChange" | "className" | "onOpenAutoFocus">) {
  return (
    <>
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <Dialog.Title className={cn(hideTitle ? "sr-only" : "text-heading font-semibold")}>
            {title}
          </Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-0.5 text-meta text-ink-2">
              {description}
            </Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          {header}
        </div>
        <Close />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
      {footer && (
        <div className="border-t border-line bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {footer}
        </div>
      )}
    </>
  );
}

export function Modal({ open, onOpenChange, className, onOpenAutoFocus, ...frame }: OverlayProps) {
  const focus = useOverlayFocus();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content
          {...focus}
          onOpenAutoFocus={onOpenAutoFocus}
          className={cn(
            "fixed z-50 flex max-h-[92dvh] flex-col bg-surface shadow-overlay outline-none",
            // Phone: bottom sheet. Larger screens: centred dialog near the top.
            "inset-x-0 bottom-0 animate-slide-in-up rounded-t-2xl",
            "sm:inset-x-auto sm:top-[10vh] sm:bottom-auto sm:left-1/2 sm:w-[min(540px,calc(100vw-32px))] sm:-translate-x-1/2 sm:animate-pop-in sm:rounded-panel",
            className,
          )}
        >
          <Frame {...frame} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SidePanel({
  open,
  onOpenChange,
  className,
  onOpenAutoFocus,
  ...frame
}: OverlayProps) {
  const focus = useOverlayFocus();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content
          {...focus}
          onOpenAutoFocus={onOpenAutoFocus}
          className={cn(
            "fixed z-50 flex flex-col bg-surface shadow-overlay outline-none",
            "inset-x-0 bottom-0 max-h-[92dvh] animate-slide-in-up rounded-t-2xl",
            // md:w-[440px]: the toast region stops this far from the right while a
            // panel is open (toast.tsx); change both together.
            "md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[440px] md:animate-slide-in-right md:rounded-none md:border-l md:border-line",
            className,
          )}
        >
          <Frame {...frame} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
