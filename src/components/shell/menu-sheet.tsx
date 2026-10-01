"use client";

import { Settings } from "lucide-react";
import Link from "next/link";

import { cn } from "../ui/cn";
import { Modal } from "../ui/overlay";
import { isActive, SECTIONS, SETTINGS_PATH } from "./navigation";
import { PageEntry } from "./section-menu";

/**
 * The phone's Menu tab: every section and page, each with what it answers,
 * and Settings last. A bottom sheet, so every page is two taps from anywhere.
 */
export function MenuSheet({
  open,
  onOpenChange,
  pathname,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly pathname: string;
}) {
  const close = () => onOpenChange(false);
  const settingsCurrent = isActive(pathname, SETTINGS_PATH);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Menu">
      <nav aria-label="All pages" className="-mx-2 flex flex-col divide-y divide-line-soft">
        {SECTIONS.map((section) => (
          <section key={section.label} aria-label={section.label} className="py-1.5">
            {section.pages.length > 1 && (
              <p className="px-3 pt-2 pb-1 text-micro font-semibold tracking-[0.06em] text-ink-3 uppercase">
                {section.label}
              </p>
            )}
            <ul>
              {section.pages.map((page) => (
                <li key={page.href}>
                  <PageEntry page={page} pathname={pathname} onNavigate={close} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        <div className="pt-1.5">
          <Link
            href={SETTINGS_PATH}
            aria-current={settingsCurrent ? "page" : undefined}
            onClick={close}
            className={cn(
              "flex items-center gap-3 rounded-control px-3 py-2.5 transition-colors",
              settingsCurrent ? "bg-mist" : "hover:bg-surface-subtle",
            )}
          >
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-control border border-line-soft bg-surface-subtle text-ocean"
            >
              <Settings className="size-4" strokeWidth={1.75} />
            </span>
            <span className="text-body font-semibold text-ink">Settings</span>
          </Link>
        </div>
      </nav>
    </Modal>
  );
}
