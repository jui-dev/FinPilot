/**
 * Top-level destinations. Each appears in navigation only once its stage
 * exists (docs/roadmap.md): the forward-looking area (working name "Plan")
 * and the Overview arrive later.
 *
 * HOME_PATH is where "/" and the logo lead. It is Activity only until the
 * Overview exists; Stage 10 sets it to "/" and gives "/" its own page. Nothing
 * else treats Activity as the home concept.
 */
export const HOME_PATH = "/activity";

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
  // Provisional home until the forward-looking area is designed (roadmap §8.3,
  // open decisions P-2/P-3, no later than Stage 8): the URLs are meant to survive
  // it. Until then Set aside lives beside Commitments behind a local switch.
  { href: "/commitments", label: "Commitments", area: ["/set-aside"] },
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
