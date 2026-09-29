"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";

import { SidePanel } from "../ui/overlay";

/** Below lg the Calendar is the agenda, and a chosen day opens as a sheet; from lg it sits beside the grid. */
const NARROW = "(max-width: 1023.98px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * A chosen day's evidence as a bottom sheet on phones and tablets. It opens
 * only when the URL names a day (so the current month's default, today, never
 * pops up on arrival) and only below lg, where there is no panel beside the
 * grid. Closing it leaves the day out of the URL; back and reload keep the
 * day that the URL names.
 */
export function DaySheet({
  open,
  title,
  closeHref,
  children,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly closeHref: string;
  readonly children: ReactNode;
}) {
  const router = useRouter();
  const narrow = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
  return (
    <SidePanel
      open={open && narrow}
      onOpenChange={(next) => {
        if (!next) router.replace(closeHref, { scroll: false });
      }}
      title={title}
      hideTitle
      className="lg:hidden [&>div:last-child]:px-0 [&>div:last-child]:pb-3"
    >
      {children}
    </SidePanel>
  );
}
