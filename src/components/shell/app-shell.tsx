"use client";

import { ArrowDownUp, CalendarClock, Plus, Receipt, Settings, Wallet } from "lucide-react";
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
import { HOME_PATH, isActive, PRIMARY_NAV, SETTINGS_PATH } from "./navigation";

const TAB_ICONS = {
  "/activity": Receipt,
  "/accounts": Wallet,
  "/cash-flow": ArrowDownUp,
  "/commitments": CalendarClock,
} as const;

/**
 * The one workspace width the navigation and every page share: a desktop
 * ceiling of 1360px (1296px of content inside 32px gutters), so wide monitors
 * get a substantial workspace without lines stretching across an ultrawide.
 */
const SHELL_WIDTH = "mx-auto w-full max-w-[1360px] px-4 md:px-6 lg:px-8";

/** Tabs before the centred + on phones; the rest follow it. */
const TABS_BEFORE_ADD = Math.ceil(PRIMARY_NAV.length / 2);

/**
 * The application frame: top navigation on desktop, a bottom tab bar with a
 * centred + on phones, and Quick Add as the one global action (the N key).
 * Only destinations that exist are shown; later stages add their own.
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
          <div className={cn(SHELL_WIDTH, "flex h-14 items-center gap-6")}>
            <Link href={HOME_PATH} className="flex items-center gap-2.5 font-semibold">
              <span aria-hidden className="grid size-7 place-items-center rounded-[7px] bg-navy">
                <span className="block h-[3px] w-3.5 rounded-full bg-coral" />
                <span className="sr-only">FinPilot</span>
              </span>
              <span className="font-brand text-figure font-bold text-navy">FinPilot</span>
            </Link>

            <nav aria-label="Main" className="hidden h-full items-stretch md:flex">
              {PRIMARY_NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "-mb-px flex items-center border-b-2 px-3.5 text-body font-medium transition-colors",
                      active
                        ? "border-navy text-navy"
                        : "border-transparent text-ink-2 hover:text-ink",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
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

        <main className={cn(SHELL_WIDTH, "flex-1 pt-6 pb-28 md:pb-12")}>{children}</main>

        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
          style={{ gridTemplateColumns: `repeat(${PRIMARY_NAV.length + 1}, minmax(0, 1fr))` }}
        >
          {PRIMARY_NAV.slice(0, TABS_BEFORE_ADD).map((item) => (
            <TabLink key={item.href} href={item.href} label={item.label} pathname={pathname} />
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
          {PRIMARY_NAV.slice(TABS_BEFORE_ADD).map((item) => (
            <TabLink key={item.href} href={item.href} label={item.label} pathname={pathname} />
          ))}
        </nav>
      </div>

      {/* Mounted only while open, so every entry starts from the remembered defaults. */}
      {adding && <QuickAdd onClose={() => setAdding(false)} data={quickAdd} />}
    </ToastProvider>
  );
}

function TabLink({
  href,
  label,
  pathname,
}: {
  readonly href: string;
  readonly label: string;
  readonly pathname: string;
}) {
  const active = isActive(pathname, href);
  const Icon = TAB_ICONS[href as keyof typeof TAB_ICONS] ?? Receipt;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex flex-col items-center gap-0.5 py-2 text-micro font-medium transition-colors",
        active ? "text-ink" : "text-ink-2",
      )}
    >
      {/* The active destination: a navy mark and icon, as well as darker text. */}
      {active && (
        <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-navy" />
      )}
      <Icon className={cn("size-[19px]", active && "text-navy")} strokeWidth={active ? 2 : 1.75} />
      {label}
    </Link>
  );
}
