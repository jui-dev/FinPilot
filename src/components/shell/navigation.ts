/**
 * FinPilot's navigation: five sections, each named for what it holds rather
 * than for its first page, so a label never hides pages behind it.
 *
 *   Overview · Transactions · Accounts · Insights · Plan
 *
 * Every page is reachable from the main navigation: a section with more than
 * one page lists them in its menu (desktop) and in the Menu sheet (phone), and
 * inside the section a row under the header lists them again. A section's
 * label leads to its first page.
 *
 * The phone's tab bar holds Overview · Transactions · + · Plan · Menu; the
 * Menu tab is current on every page the other tabs don't cover.
 *
 * HOME_PATH is where the logo leads: "/", the Overview. A page is current only
 * on its own path or below it, and nothing lies below "/", so the Overview is
 * current on exactly "/".
 */
export const HOME_PATH = "/";
export const SETTINGS_PATH = "/settings";
/** The Guide: how FinPilot works. Like Settings it belongs to no section; the ? in the header leads there. */
export const GUIDE_PATH = "/guide";

export interface NavPage {
  readonly href: string;
  readonly label: string;
  /** One line on what the page answers, shown in the section menus. */
  readonly description: string;
}

export interface NavSection {
  readonly label: string;
  /** The section's pages in order; the first is where its label leads. */
  readonly pages: readonly [NavPage, ...NavPage[]];
  /** False for a section with no phone tab: on phones it is in the Menu sheet. */
  readonly phoneTab?: false;
}

export const SECTIONS: readonly NavSection[] = [
  {
    label: "Overview",
    pages: [{ href: HOME_PATH, label: "Overview", description: "Where you stand today" }],
  },
  {
    label: "Transactions",
    pages: [
      { href: "/activity", label: "Activity", description: "Every transaction, newest first" },
      { href: "/categories", label: "Categories", description: "How transactions are grouped" },
    ],
  },
  {
    label: "Accounts",
    pages: [{ href: "/accounts", label: "Accounts", description: "Balances and what you own" }],
    phoneTab: false,
  },
  {
    label: "Insights",
    pages: [
      { href: "/cash-flow", label: "Cash flow", description: "One month: in, out, left over" },
      { href: "/trends", label: "Trends", description: "Month by month, complete months" },
      { href: "/calendar", label: "Calendar", description: "When money moved, day by day" },
    ],
    phoneTab: false,
  },
  {
    label: "Plan",
    pages: [
      { href: "/available", label: "Available", description: "What you can use now" },
      { href: "/commitments", label: "Commitments", description: "Payments due on a schedule" },
      { href: "/set-aside", label: "Set aside", description: "Money kept for a purpose" },
    ],
  },
];

/** The sections with a tab on the phone's bar; the rest are in the Menu sheet. */
export const PHONE_TABS: readonly NavSection[] = SECTIONS.filter((s) => s.phoneTab !== false);

/** Where a section's label leads: its first page. */
export const sectionHref = (section: NavSection) => section.pages[0].href;

export const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/** The section the current page belongs to, if any (Settings belongs to none). */
export const currentSection = (pathname: string) =>
  SECTIONS.find((s) => s.pages.some((p) => isActive(pathname, p.href)));

/**
 * How a section is current: "page" on the page its label leads to, "area" on
 * another of its pages (announced as aria-current="true"), or not at all.
 */
export function navState(pathname: string, section: NavSection): "page" | "area" | null {
  if (isActive(pathname, sectionHref(section))) return "page";
  return section.pages.some((p) => isActive(pathname, p.href)) ? "area" : null;
}

/** The value aria-current takes for a section's state. */
export const ariaCurrent = (state: "page" | "area" | null) =>
  state === "page" ? ("page" as const) : state === "area" ? ("true" as const) : undefined;

/** The phone's Menu tab is current wherever no other tab is: Accounts, Insights, Settings. */
export const menuTabCurrent = (pathname: string) =>
  !PHONE_TABS.some((s) => navState(pathname, s) !== null);
