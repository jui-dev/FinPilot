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
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/activity", label: "Activity" },
  { href: "/accounts", label: "Accounts" },
  { href: "/cash-flow", label: "Cash flow" },
  // Provisional home until the forward-looking area is designed (roadmap §8.3,
  // open decisions P-2/P-3, no later than Stage 8): the URL is meant to survive it.
  { href: "/commitments", label: "Commitments" },
];

export const SETTINGS_PATH = "/settings";

export const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);
