import type { Money } from "@/domain/money";
import type {
  AvailableAccountView,
  AvailableEarmarkView,
  AvailableView,
} from "@/server/services/available-service";

/**
 * How Available reads. Every figure comes from the Available read model;
 * nothing here adds up money. This only chooses words and states, and turns
 * the model's terms into the proportions the spoken-for bar draws.
 */

/** The set-aside deduction's label (roadmap Stage 8, A-4): only covered money in counted accounts. */
export const SET_ASIDE_LABEL = "Set aside from Available";

export const SET_ASIDE_NOTE =
  "Only set-aside money held in accounts that count toward Available is deducted.";

export type Outcome = "free" | "zero" | "over";

export const outcomeOf = (available: Money): Outcome =>
  available > 0 ? "free" : available === 0 ? "zero" : "over";

/** The card line: omitted without a card account; worded by the sign of the balance. */
export type CardsRow = {
  readonly label: "Owed on cards" | "Credit on cards" | "Nothing owed on cards";
  /** liabilityBalances, signed as stored. */
  readonly amount: Money;
} | null;

export function cardsRow(view: AvailableView): CardsRow {
  if (!view.accounts.some((a) => a.accountClass === "liability")) return null;
  const amount = view.liabilityBalances;
  const label =
    amount < 0 ? "Owed on cards" : amount > 0 ? "Credit on cards" : "Nothing owed on cards";
  return { label, amount };
}

/** What stands between the balances and Available, in bridge order, for the hero sentence. */
export function spokenFor(view: AvailableView, dueBy: string): string[] {
  const parts: string[] = [];
  if (view.liabilityBalances < 0) parts.push("what you owe on cards");
  if (view.commitmentsDue > 0) parts.push(`payments due by ${dueBy}`);
  if (view.coveredEarmarks > 0) parts.push("money set aside");
  return parts;
}

/** "a", "a and b", "a, b and c". */
export const listOf = (parts: readonly string[]): string =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

export type SegmentKind = "owed" | "payments" | "setAside" | "available";

export interface BarSegment {
  readonly kind: SegmentKind;
  readonly amount: Money;
  /** Share of the bar, 0–1. */
  readonly share: number;
}

export interface SpokenForBar {
  /** What the bar stands for: the balances it divides up. */
  readonly pool: Money;
  readonly segments: readonly BarSegment[];
  /**
   * When more is spoken for than the balances hold: the over-commitment
   * (the magnitude of a negative Available) and where it starts along the bar.
   */
  readonly over: { readonly amount: Money; readonly from: number } | null;
}

/**
 * How the balances divide into what is spoken for and what is left. The pool
 * is the bridge's (the money in counted accounts, plus a card's credit
 * balance): owed + payments + set aside + Available = pool. When Available
 * is negative, the spoken-for parts exceed the pool and the excess is the
 * over-commitment. With no money in the pool the bar cannot say anything true,
 * so there is none, and the bridge carries the explanation alone.
 */
export function spokenForBar(view: AvailableView): SpokenForBar | null {
  const { pool } = view;
  if (pool <= 0) return null;
  const owed = view.liabilityBalances < 0 ? (-view.liabilityBalances as Money) : (0 as Money);
  const parts: [SegmentKind, Money][] = [
    ["owed", owed],
    ["payments", view.commitmentsDue],
    ["setAside", view.coveredEarmarks],
  ];
  const over = view.available < 0;
  if (!over) parts.push(["available", view.available]);
  const total = over ? pool - view.available : pool;
  return {
    pool,
    segments: parts
      .filter(([, amount]) => amount > 0)
      .map(([kind, amount]) => ({ kind, amount, share: amount / total })),
    over: over ? { amount: -view.available as Money, from: pool / total } : null,
  };
}

/**
 * The answer card's three facts. Left free: Available's share of the pool,
 * none when the pool holds nothing or nothing is free. Spoken for: what the
 * pool carries besides Available (owed on cards + payments due + set aside).
 */
export function heroFacts(view: AvailableView): {
  readonly leftFree: number | null;
  readonly spokenFor: Money;
} {
  const owed = view.liabilityBalances < 0 ? -view.liabilityBalances : 0;
  return {
    leftFree: view.pool > 0 ? Math.max(view.available, 0) / view.pool : null,
    spokenFor: (owed + view.commitmentsDue + view.coveredEarmarks) as Money,
  };
}

/**
 * The accounts behind the balances, as evidence. An archived account with a
 * zero balance adds nothing and is left out; an excluded account appears only
 * when it holds money or money set aside, since that is what it explains.
 */
export function accountEvidence(view: AvailableView) {
  const holdsSetAside = new Set(view.earmarks.map((e) => e.accountId));
  const relevant = (a: AvailableAccountView) =>
    a.balance !== 0 || holdsSetAside.has(a.accountId) || !a.archived;
  return {
    counted: view.accounts.filter((a) => a.accountClass === "asset" && a.counted && relevant(a)),
    cards: view.accounts.filter((a) => a.accountClass === "liability" && relevant(a)),
    notCounted: view.accounts.filter(
      (a) =>
        a.accountClass === "asset" &&
        !a.counted &&
        (a.balance !== 0 || holdsSetAside.has(a.accountId)),
    ),
  };
}

/** Set-aside evidence: what is deducted, and what is not because its account is outside Available. */
export function earmarkEvidence(view: AvailableView): {
  readonly deducted: readonly AvailableEarmarkView[];
  readonly notDeducted: readonly AvailableEarmarkView[];
} {
  return {
    deducted: view.earmarks.filter((e) => e.deducted),
    notDeducted: view.earmarks.filter((e) => !e.deducted),
  };
}
