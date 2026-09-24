/**
 * Top-level destinations. Each appears in navigation only once its stage
 * exists (docs/roadmap.md): Plan and the Overview arrive later.
 *
 * HOME_PATH is where "/" and the logo lead. It is Activity only until the
 * Overview exists; Stage 11 sets it to "/" and gives "/" its own page. Nothing
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
];

export const SETTINGS_PATH = "/settings";

export const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);
