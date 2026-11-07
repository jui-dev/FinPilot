import type { LucideIcon } from "lucide-react";

import { accountClass } from "@/domain/ledger/accounts";
import { negate, type Money } from "@/domain/money";
import type { ActivityItem } from "@/server/services/activity-service";

import {
  accountIcon,
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
 *
 * The same event is laid out three ways: as columns (category, account) on
 * wider screens, and as one `meta` line on phones.
 */
export interface EventDescription {
  readonly title: string;
  /** Phones: the line under the title ("Groceries · Visa card"). */
  readonly meta: string[];
  /** The Category column: the category, or what kind of movement it is. */
  readonly category: string;
  /** The Account column: the account (with its type's icon), or a transfer's route. */
  readonly account: { readonly label: string; readonly icon: LucideIcon | null };
  /** A quiet second line under the title on wider screens: the note, or what it refers to. */
  readonly detail: string | null;
  readonly icon: LucideIcon;
  readonly tone: GlyphTone;
  readonly tag: { readonly label: string; readonly tone: "info" | "positive" | "neutral" } | null;
  readonly amount: Money;
  readonly sign: "negative" | "always" | "none";
  readonly amountClass: string;
  /** The fee recorded with a transfer, as a magnitude. */
  readonly fee: Money | null;
}

const magnitudeOf = (amount: Money): Money => (amount < 0 ? negate(amount) : amount) as Money;

export function describeEvent(item: ActivityItem, perspectiveAccountId?: string): EventDescription {
  const row = item.primary;
  const magnitude = magnitudeOf(row.amount);
  const note = row.note || null;
  const own = { label: row.account.name, icon: accountIcon(row.account.type) };

  switch (row.type) {
    case "expense": {
      const category = row.category?.name ?? "Uncategorised";
      return {
        title: row.description || row.category?.name || "Expense",
        meta: [category, row.account.name],
        category,
        account: own,
        detail: note,
        icon: categoryIcon(row.category?.name),
        tone: "neutral",
        tag: null,
        amount: negate(magnitude),
        sign: "negative",
        amountClass: "text-ink",
        fee: null,
      };
    }
    case "income": {
      const category = row.category?.name ?? "Income";
      return {
        title: row.description || row.category?.name || "Income",
        meta: [category, row.account.name],
        category,
        account: own,
        detail: note,
        icon: categoryIcon(row.category?.name),
        tone: "positive",
        tag: null,
        amount: magnitude,
        sign: "always",
        amountClass: "text-positive",
        fee: null,
      };
    }
    case "refund": {
      const category = row.category?.name ?? "Refund";
      const original = item.refundOf?.description ?? null;
      return {
        title: row.description || `Refund${original ? ` — ${original}` : ""}`,
        meta: [category, row.account.name],
        category,
        account: own,
        // The title already names the original when there is no description.
        detail: note ?? (row.description && original ? `Refund of ${original}` : null),
        icon: RefundIcon,
        tone: "positive",
        tag: { label: "Refund", tone: "positive" },
        amount: magnitude,
        sign: "always",
        amountClass: "text-positive",
        fee: null,
      };
    }
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
        meta: [route],
        category: cardPayment ? "Card payment" : "Transfer",
        account: { label: route, icon: null },
        detail: note,
        icon: TransferIcon,
        tone: "info",
        tag: cardPayment ? { label: "Card payment", tone: "info" } : null,
        amount: outgoing ? negate(magnitude) : magnitude,
        sign: incoming ? "always" : outgoing ? "negative" : "none",
        amountClass: "text-ink-2",
        fee: item.fee ? magnitudeOf(item.fee.amount) : null,
      };
    }
    case "opening_balance": {
      const owed = accountClass(row.account.type) === "liability";
      const kind = owed ? "Owed at start" : "Starting balance";
      return {
        title: "Opening balance",
        meta: [row.account.name, kind],
        category: kind,
        account: own,
        detail: note,
        icon: OpeningIcon,
        tone: "neutral",
        tag: null,
        amount: owed ? magnitude : row.amount,
        sign: owed ? "none" : "negative",
        amountClass: "text-ink-2",
        fee: null,
      };
    }
    case "adjustment":
      // An adjustment is a signed correction, not a balance: it is shown with
      // its direction on every account class, liabilities included, because
      // "৳350" alone cannot say whether the balance went up or down.
      return {
        title: "Balance adjustment",
        meta: [row.account.name, "From verifying the balance"],
        category: "Adjustment",
        account: own,
        detail: note ?? "From verifying the balance",
        icon: OpeningIcon,
        tone: "neutral",
        tag: null,
        amount: row.amount,
        sign: "always",
        amountClass: "text-ink-2",
        fee: null,
      };
  }
}

/**
 * The first archived account (by name) any row of the event touches, or null.
 * The ledger freezes such an event: it can't be edited or deleted until the
 * account is restored, so the transaction panel offers neither.
 */
export function archivedAccountOf(
  item: ActivityItem | null,
  accounts: ReadonlyArray<{ id: string; name: string; archivedAt: string | null }>,
): string | null {
  if (!item) return null;
  const touched = new Set(
    [item.primary, ...(item.fee ? [item.fee] : [])].flatMap((r) =>
      r.counterAccount ? [r.account.id, r.counterAccount.id] : [r.account.id],
    ),
  );
  const archived = accounts
    .filter((a) => a.archivedAt !== null && touched.has(a.id))
    .map((a) => a.name)
    .sort((a, b) => a.localeCompare(b));
  return archived[0] ?? null;
}
