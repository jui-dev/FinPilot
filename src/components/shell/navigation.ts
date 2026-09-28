/**
 * Top-level destinations. Each appears in navigation only once its stage
 * exists (docs/roadmap.md): the Overview arrives later.
 *
 * HOME_PATH is where the logo leads: "/", Attention's first home (Stage 9,
 * P-4), which Stage 10 grows into the Overview. "/" is deliberately not a
 * destination in PRIMARY_NAV, so the phone keeps four tabs around the +.
 */
export const HOME_PATH = "/";

export interface NavItem {
  readonly href: string;
  readonly label: string;
  /** Other pages inside this destination's area, which keep it marked as current. */
  readonly area?: readonly string[];
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/activity", label: "Activity" },
  { href: "/accounts", label: "Accounts" },
  { href: "/cash-flow", label: "Cash flow" },
  // The forward-looking area (roadmap §8.3, P-2): it leads with Available, and
  // Commitments and Set aside, its inputs, are its other pages behind a local switch.
  { href: "/available", label: "Available", area: ["/commitments", "/set-aside"] },
];

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
