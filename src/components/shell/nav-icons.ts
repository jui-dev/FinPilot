import {
  ArrowDownUp,
  CalendarDays,
  ChartLine,
  CircleGauge,
  House,
  PiggyBank,
  Receipt,
  Repeat,
  Tag,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/** Each section's icon: the phone tabs and the head of a section's row. */
export const SECTION_ICONS: Readonly<Record<string, LucideIcon>> = {
  Overview: House,
  Transactions: Receipt,
  Accounts: Wallet,
  Insights: ChartLine,
  Plan: CircleGauge,
};

/** Each page's icon, by its path: the section menus, the Menu sheet and a section's row. */
export const PAGE_ICONS: Readonly<Record<string, LucideIcon>> = {
  "/": House,
  "/activity": Receipt,
  "/categories": Tag,
  "/accounts": Wallet,
  "/cash-flow": ArrowDownUp,
  "/trends": TrendingUp,
  "/calendar": CalendarDays,
  "/available": CircleGauge,
  "/commitments": Repeat,
  "/set-aside": PiggyBank,
};
