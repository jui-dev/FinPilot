import type { LucideIcon } from "lucide-react";

import { accountClass } from "@/domain/ledger/accounts";
import { formatMoney, negate, type Money } from "@/domain/money";
import type { ActivityItem } from "@/server/services/activity-service";

import {
  categoryIcon,
  OpeningIcon,
  RefundIcon,
  TransferIcon,
  type GlyphTone,
} from "../ledger/icons";

/**
 * How one ledger event reads in a list. Amounts are shown from the person's
 * side: spending with a minus in ink (spending is normal, never red), money
 * received with a green plus, transfers as a neutral movement
 * (docs/design-direction.md §2–§3). No type jargon.
 */
export interface EventDescription {
  readonly title: string;
  readonly meta: string[];
  readonly icon: LucideIcon;
  readonly tone: GlyphTone;
  readonly tag: { readonly label: string; readonly tone: "sky" | "positive" | "neutral" } | null;
  readonly amount: Money;
  readonly sign: "negative" | "always" | "none";
  readonly amountClass: string;
}

export function describeEvent(item: ActivityItem, perspectiveAccountId?: string): EventDescription {
  const row = item.primary;
  const magnitude = (row.amount < 0 ? negate(row.amount) : row.amount) as Money;

  switch (row.type) {
    case "expense":
      return {
        title: row.description || row.category?.name || "Expense",
        meta: [row.category?.name ?? "Uncategorised", row.account.name],
        icon: categoryIcon(row.category?.name),
        tone: "neutral",
        tag: null,
        amount: negate(magnitude),
        sign: "negative",
        amountClass: "text-ink",
      };
    case "income":
      return {
        title: row.description || row.category?.name || "Income",
        meta: [row.category?.name ?? "Income", row.account.name],
        icon: categoryIcon(row.category?.name),
        tone: "positive",
        tag: null,
        amount: magnitude,
        sign: "always",
        amountClass: "text-positive",
      };
    case "refund":
      return {
        title:
          row.description ||
          `Refund${item.refundOf?.description ? ` — ${item.refundOf.description}` : ""}`,
        meta: [row.category?.name ?? "Refund", row.account.name],
        icon: RefundIcon,
        tone: "positive",
        tag: { label: "Refund", tone: "positive" },
        amount: magnitude,
        sign: "always",
        amountClass: "text-positive",
      };
    case "transfer": {
      const to = row.counterAccount;
      const cardPayment = to !== null && accountClass(to.type) === "liability";
      const route = `${row.account.name} → ${to?.name ?? "?"}`;
      const incoming = perspectiveAccountId !== undefined && to?.id === perspectiveAccountId;
      const outgoing =
        perspectiveAccountId !== undefined && row.account.id === perspectiveAccountId;
      return {
        title:
          row.description ||
          (cardPayment ? "Card payment" : `Transfer to ${to?.name ?? "account"}`),
        meta: item.fee ? [route, `+ ${feeText(item)} fee`] : [route],
        icon: TransferIcon,
        tone: "sky",
        tag: cardPayment ? { label: "Card payment", tone: "sky" } : null,
        amount: outgoing ? negate(magnitude) : magnitude,
        sign: incoming ? "always" : outgoing ? "negative" : "none",
        amountClass: "text-ink-2",
      };
    }
    case "opening_balance": {
      const owed = accountClass(row.account.type) === "liability";
      return {
        title: "Opening balance",
        meta: [row.account.name, owed ? "Owed at start" : "Starting balance"],
        icon: OpeningIcon,
        tone: "neutral",
        tag: null,
        amount: owed ? magnitude : row.amount,
        sign: owed ? "none" : "negative",
        amountClass: "text-ink-2",
      };
    }
    case "adjustment":
      // An adjustment is a signed correction, not a balance: it is shown with
      // its direction on every account class, liabilities included, because
      // "৳350" alone cannot say whether the balance went up or down.
      return {
        title: "Balance adjustment",
        meta: [row.account.name, "From verifying the balance"],
        icon: OpeningIcon,
        tone: "neutral",
        tag: null,
        amount: row.amount,
        sign: "always",
        amountClass: "text-ink-2",
      };
  }
}

function feeText(item: ActivityItem): string {
  if (!item.fee) return "";
  return formatMoney(item.fee.amount < 0 ? negate(item.fee.amount) : item.fee.amount);
}
