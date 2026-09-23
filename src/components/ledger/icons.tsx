import {
  ArrowLeftRight,
  Banknote,
  BriefcaseBusiness,
  Car,
  Clapperboard,
  Coins,
  CreditCard,
  Flag,
  HeartPulse,
  House,
  Landmark,
  PiggyBank,
  Receipt,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Tag,
  Undo2,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { AccountType } from "@/domain/ledger/accounts";

import { cn } from "../ui/cn";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  cash: "Cash",
  bank: "Bank",
  mobile_wallet: "Mobile wallet",
  savings: "Savings",
  credit_card: "Credit card",
};

const ACCOUNT_ICONS: Record<AccountType, LucideIcon> = {
  cash: Banknote,
  bank: Landmark,
  mobile_wallet: Smartphone,
  savings: PiggyBank,
  credit_card: CreditCard,
};

/**
 * Icons for the seeded default categories. A category a person creates (or
 * renames) gets the generic tag: correctness never depends on assigning icons
 * by hand (docs/design-direction.md §4).
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Salary: BriefcaseBusiness,
  "Other Income": Coins,
  Housing: House,
  "Food & Dining": UtensilsCrossed,
  Groceries: ShoppingBasket,
  Transport: Car,
  Shopping: ShoppingBag,
  Utilities: Zap,
  Entertainment: Clapperboard,
  Health: HeartPulse,
  "Fees & Charges": Receipt,
};

export type GlyphTone = "neutral" | "positive" | "sky";

const tones: Record<GlyphTone, string> = {
  neutral: "bg-surface-hover text-ink-2",
  positive: "bg-positive-soft text-positive",
  sky: "bg-sky-soft text-sky-ink",
};

/** A small round icon badge in front of a row. */
export function Glyph({
  icon: Icon,
  tone = "neutral",
  className,
}: {
  readonly icon: LucideIcon;
  readonly tone?: GlyphTone;
  readonly className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("grid size-9 shrink-0 place-items-center rounded-full", tones[tone], className)}
    >
      <Icon className="size-[17px]" strokeWidth={1.75} />
    </span>
  );
}

export const accountIcon = (type: AccountType): LucideIcon => ACCOUNT_ICONS[type];
export const categoryIcon = (name: string | undefined): LucideIcon =>
  (name && CATEGORY_ICONS[name]) || Tag;

export const TransferIcon = ArrowLeftRight;
export const RefundIcon = Undo2;
export const OpeningIcon = Flag;
