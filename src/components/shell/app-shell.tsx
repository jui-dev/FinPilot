"use client";

import { Menu, Plus, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import type { CalendarDate } from "@/domain/calendar-date";

import { longDate } from "../format";
import { QuickAdd, type QuickAddData } from "../quick-add/quick-add";
import { buttonClass } from "../ui/button";
import { cn } from "../ui/cn";
import { Tag } from "../ui/panel";
import { ToastProvider } from "../ui/toast";
import { MenuSheet } from "./menu-sheet";
import { SECTION_ICONS } from "./nav-icons";
import {
  ariaCurrent,
  currentSection,
  HOME_PATH,
  isActive,
  menuTabCurrent,
  navState,
  PHONE_TABS,
  SECTIONS,
  sectionHref,
  SETTINGS_PATH,
} from "./navigation";
import { SectionLink, SectionMenu } from "./section-menu";
import { SectionNav } from "./section-nav";

/**
 * The one workspace width the navigation and every page share: a desktop
 * ceiling of 1360px (1296px of content inside 32px gutters), so wide monitors
 * get a substantial workspace without lines stretching across an ultrawide.
 */
const SHELL_WIDTH = "mx-auto w-full max-w-[1360px] px-4 md:px-6 lg:px-8";

/** Tabs before the centred + on phones; the rest, then Menu, follow it. */
const TABS_BEFORE_ADD = 2;

/**
 * The application frame: the sections across the top on desktop, a row of the
 * current section's pages under the header, a bottom tab bar with a centred +
 * and a Menu sheet on phones, and Quick Add as the one global action (the N key).
 */
export function AppShell({
  today,
  quickAdd,
  children,
}: {
  readonly today: CalendarDate;
  readonly quickAdd: QuickAddData;
  readonly children: ReactNode;
}) {
  const pathname = usePathname();
  const [adding, setAdding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const section = currentSection(pathname);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "n" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      setAdding(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-surface">
          <div className={cn(SHELL_WIDTH, "flex h-14 items-center gap-4 lg:gap-6")}>
            <Link href={HOME_PATH} className="flex items-center gap-2.5 font-semibold">
              <span aria-hidden className="grid size-7 place-items-center rounded-[7px] bg-navy">
                <span className="block h-[3px] w-3.5 rounded-full bg-coral" />
                <span className="sr-only">FinPilot</span>
              </span>
              {/* From 768px to 1024px the mark alone (the name stays for screen readers), so the five sections fit. */}
              <span className="font-brand text-figure font-bold text-navy md:max-lg:sr-only">
                FinPilot
              </span>
            </Link>

            <nav aria-label="Main" className="hidden items-center gap-0.5 md:flex">
              {SECTIONS.map((s) =>
                s.pages.length > 1 ? (
                  <SectionMenu key={s.label} section={s} pathname={pathname} />
                ) : (
                  <SectionLink key={s.label} section={s} pathname={pathname} />
                ),
              )}
            </nav>

            <div className="ml-auto flex items-center gap-2 md:gap-3">
              <span className="hidden text-meta text-ink-2 lg:inline">{longDate(today)}</span>
              <Tag>Demo</Tag>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className={cn(buttonClass("accent", "sm"), "gap-2 max-md:hidden")}
              >
                <Plus className="size-4" strokeWidth={2.25} />
                Add
                <kbd className="rounded border border-ink/30 px-1 text-micro font-medium">N</kbd>
              </button>
              <Link
                href={SETTINGS_PATH}
                aria-label="Settings"
                aria-current={isActive(pathname, SETTINGS_PATH) ? "page" : undefined}
                className={cn(
                  "grid size-9 place-items-center rounded-control text-ink-2 transition-colors hover:bg-surface-hover hover:text-ink",
                  isActive(pathname, SETTINGS_PATH) && "bg-surface-hover text-ink",
                )}
              >
                <Settings className="size-[18px]" strokeWidth={1.75} />
              </Link>
            </div>
          </div>
        </header>

        {section && section.pages.length > 1 && (
          <SectionNav section={section} pathname={pathname} className={SHELL_WIDTH} />
        )}

        <main className={cn(SHELL_WIDTH, "flex-1 pt-6 pb-28 md:pb-12")}>{children}</main>

        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
          style={{ gridTemplateColumns: `repeat(${PHONE_TABS.length + 2}, minmax(0, 1fr))` }}
        >
          {PHONE_TABS.slice(0, TABS_BEFORE_ADD).map((s) => (
            <TabLink
              key={s.label}
              href={sectionHref(s)}
              label={s.label}
              icon={SECTION_ICONS[s.label]!}
              state={navState(pathname, s)}
            />
          ))}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex flex-col items-center justify-center py-1.5"
            aria-label="Add a transaction"
          >
            <span className="-mt-5 grid size-12 place-items-center rounded-[14px] bg-coral text-ink shadow-overlay">
              <Plus className="size-6" strokeWidth={2.25} />
            </span>
          </button>
          {PHONE_TABS.slice(TABS_BEFORE_ADD).map((s) => (
            <TabLink
              key={s.label}
              href={sectionHref(s)}
              label={s.label}
              icon={SECTION_ICONS[s.label]!}
              state={navState(pathname, s)}
            />
          ))}
          {/* Every page, two taps away; current wherever no other tab is (Accounts, Insights, Settings). */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-haspopup="dialog"
            className={tabClass}
          >
            <TabFace icon={Menu} label="Menu" active={menuOpen || menuTabCurrent(pathname)} />
          </button>
        </nav>
      </div>

      <MenuSheet open={menuOpen} onOpenChange={setMenuOpen} pathname={pathname} />
      {/* Mounted only while open, so every entry starts from the remembered defaults. */}
      {adding && <QuickAdd onClose={() => setAdding(false)} data={quickAdd} />}
    </ToastProvider>
  );
}

const tabClass = "flex flex-col items-center gap-0.5 pt-1.5 pb-2";

function TabLink({
  href,
  label,
  icon,
  state,
}: {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly state: "page" | "area" | null;
}) {
  return (
    <Link href={href} aria-current={ariaCurrent(state)} className={tabClass}>
      <TabFace icon={icon} label={label} active={state !== null} />
    </Link>
  );
}

/** A tab's icon and label; the current tab's icon sits in a mist capsule. */
function TabFace({
  icon: Icon,
  label,
  active,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly active: boolean;
}) {
  return (
    <>
      <span
        aria-hidden
        className={cn(
          "grid h-7 w-13 place-items-center rounded-full transition-colors",
          active ? "bg-mist text-navy" : "text-ink-2",
        )}
      >
        <Icon className="size-[19px]" strokeWidth={active ? 2 : 1.75} />
      </span>
      <span
        className={cn(
          "text-micro transition-colors",
          active ? "font-semibold text-navy" : "font-medium text-ink-2",
        )}
      >
        {label}
      </span>
    </>
  );
}
