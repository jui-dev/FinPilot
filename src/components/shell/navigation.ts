/**
 * Top-level destinations (roadmap §8.5, P-3). Desktop shows all of them:
 * Overview · Activity · Accounts · Cash flow · Available. The phone's tab bar
 * shows those that are phone tabs — Overview · Activity · + · Accounts ·
 * Available — so it keeps four destinations around the centred +.
 *
 * HOME_PATH is where the logo leads: "/", the Overview (Stage 10), which is
 * also the first destination. A destination is current only on its own path
 * or below it, and nothing lies below "/", so the Overview is current on
 * exactly "/".
 */
export const HOME_PATH = "/";

export interface NavItem {
  readonly href: string;
  readonly label: string;
  /** Other pages inside this destination's area, which keep it marked as current. */
  readonly area?: readonly string[];
  /** False for a destination with no phone tab: it is reached from context there. */
  readonly phoneTab?: false;
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { href: HOME_PATH, label: "Overview" },
  { href: "/activity", label: "Activity" },
  { href: "/accounts", label: "Accounts" },
  // No phone tab (P-3): on phones Cash flow is reached from the Overview's This
  // month, Attention and Activity, and stays its own page with no tab current.
  // Trends and Calendar are the other pages of its area, behind a local switch.
  { href: "/cash-flow", label: "Cash flow", area: ["/trends", "/calendar"], phoneTab: false },
  // The forward-looking area (roadmap §8.3, P-2): it leads with Available, and
  // Commitments and Set aside, its inputs, are its other pages behind a local switch.
  { href: "/available", label: "Available", area: ["/commitments", "/set-aside"] },
];

/** The phone's tab bar, around the centred +. */
export const PHONE_TABS: readonly NavItem[] = PRIMARY_NAV.filter((i) => i.phoneTab !== false);

export const SETTINGS_PATH = "/settings";

export const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/**
 * How a destination is current: "page" on its own page, "area" on another page
 * of its area (announced as aria-current="true"), or not at all.
 */
export function navState(pathname: string, item: NavItem): "page" | "area" | null {
  if (isActive(pathname, item.href)) return "page";
  return item.area?.some((href) => isActive(pathname, href)) ? "area" : null;
}

/** The value aria-current takes for a destination's state. */
export const ariaCurrent = (state: "page" | "area" | null) =>
  state === "page" ? ("page" as const) : state === "area" ? ("true" as const) : undefined;
