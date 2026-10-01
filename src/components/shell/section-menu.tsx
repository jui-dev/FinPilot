"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FocusEvent } from "react";

import { cn } from "../ui/cn";
import { PAGE_ICONS } from "./nav-icons";
import {
  ariaCurrent,
  isActive,
  navState,
  sectionHref,
  type NavPage,
  type NavSection,
} from "./navigation";

/** The current section: a mist pill with navy text. Others take a warm tint on hover. */
const pillClass = (current: boolean) =>
  cn(
    "flex items-center rounded-[9px] transition-colors",
    current ? "bg-mist" : "hover:bg-surface-hover",
  );

const labelClass = (current: boolean) =>
  cn(
    "flex h-9 items-center text-body whitespace-nowrap transition-colors",
    "focus-visible:outline-2 focus-visible:outline-ocean",
    current ? "font-semibold text-navy" : "font-medium text-ink-2 hover:text-ink",
  );

/** A section with one page: its label is a plain link. */
export function SectionLink({
  section,
  pathname,
}: {
  readonly section: NavSection;
  readonly pathname: string;
}) {
  const state = navState(pathname, section);
  return (
    <div className={pillClass(state !== null)}>
      <Link
        href={sectionHref(section)}
        aria-current={ariaCurrent(state)}
        className={cn(labelClass(state !== null), "rounded-[9px] px-2 lg:px-3")}
      >
        {section.label}
      </Link>
    </div>
  );
}

/**
 * A section with several pages: its label leads to the first, and the chevron
 * beside it opens a menu of all of them, each with what it answers. A
 * disclosure of links rather than an ARIA menu: Tab moves through the links,
 * and Escape, a click elsewhere or focus leaving closes it.
 */
export function SectionMenu({
  section,
  pathname,
}: {
  readonly section: NavSection;
  readonly pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const state = navState(pathname, section);
  const current = state !== null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !event.currentTarget.contains(next)) setOpen(false);
  };

  return (
    <div ref={root} onBlur={onBlur} className={cn("relative", pillClass(current))}>
      <Link
        href={sectionHref(section)}
        aria-current={ariaCurrent(state)}
        onClick={() => setOpen(false)}
        className={cn(labelClass(current), "rounded-l-[9px] pr-1 pl-2 lg:pl-3")}
      >
        {section.label}
      </Link>
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${section.label} pages`}
        onClick={() => setOpen((was) => !was)}
        className={cn(
          "grid h-9 w-6 place-items-center rounded-r-[9px] pr-1 transition-colors",
          "focus-visible:outline-2 focus-visible:outline-ocean",
          current ? "text-navy hover:bg-navy/10" : "text-ink-2 hover:text-ink",
        )}
      >
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute top-[calc(100%+8px)] left-0 z-40 w-80 animate-pop-in rounded-panel border border-line bg-surface p-1.5 shadow-overlay"
        >
          <p className="px-3 pt-2 pb-1 text-micro font-semibold tracking-[0.06em] text-ink-3 uppercase">
            {section.label}
          </p>
          <ul>
            {section.pages.map((page) => (
              <li key={page.href}>
                <PageEntry page={page} pathname={pathname} onNavigate={() => setOpen(false)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A page in a section menu or the Menu sheet: its icon, its name and what it answers. */
export function PageEntry({
  page,
  pathname,
  onNavigate,
}: {
  readonly page: NavPage;
  readonly pathname: string;
  readonly onNavigate: () => void;
}) {
  const current = isActive(pathname, page.href);
  const Icon = PAGE_ICONS[page.href];
  return (
    <Link
      href={page.href}
      aria-current={current ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex items-start gap-3 rounded-control px-3 py-2.5 transition-colors",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ocean",
        current ? "bg-mist" : "hover:bg-surface-subtle",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-control border border-line-soft text-ocean",
          current ? "bg-surface" : "bg-surface-subtle",
        )}
      >
        {Icon && <Icon className="size-4" strokeWidth={1.75} />}
      </span>
      <span className="min-w-0">
        <span className="block text-body font-semibold text-ink">{page.label}</span>
        <span className="block text-meta text-ink-2">{page.description}</span>
      </span>
    </Link>
  );
}
