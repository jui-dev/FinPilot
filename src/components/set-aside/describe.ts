import { formatShare, type Ratio } from "@/domain/ledger/analytics";
import { sum, type Money } from "@/domain/money";
import type { ItemCover } from "@/domain/protected-money/items";

/**
 * How Set aside reads, from the derived cover the service returns. Nothing
 * here decides what is covered, short or still needed; it only chooses what
 * to show. When everything set aside is still covered, one number is enough.
 */

export type Backing =
  | { readonly kind: "empty" }
  | { readonly kind: "covered"; readonly setAside: Money }
  | {
      readonly kind: "short";
      readonly covered: Money;
      readonly setAside: Money;
      readonly short: Money;
    };

export function backing(cover: ItemCover): Backing {
  if (cover.reserved === 0) return { kind: "empty" };
  if (cover.short === 0) return { kind: "covered", setAside: cover.reserved };
  return { kind: "short", covered: cover.covered, setAside: cover.reserved, short: cover.short };
}

export interface TargetView {
  readonly target: Money;
  readonly stillNeeded: Money;
  readonly progress: Ratio;
  readonly reached: boolean;
}

/** Only an item with a target has one; nothing goal-like is invented without it. */
export function targetView(cover: ItemCover): TargetView | null {
  if (cover.target === null || cover.stillNeeded === null || cover.progress === null) return null;
  return {
    target: cover.target,
    stillNeeded: cover.stillNeeded,
    progress: cover.progress,
    reached: cover.targetReached === true,
  };
}

/**
 * Progress as a whole percentage. Rounding happens only here, for display: a
 * target that is not reached never reads "100%" (99.95% shows as "99%"), so
 * the label cannot contradict the exact domain result. Above 100% is shown.
 */
export function progressLabel(view: TargetView): string {
  const label = formatShare(view.progress);
  return !view.reached && label === "100%" ? "99%" : label;
}

/**
 * The target bar's geometry, as shares of the target (0–1): covered is filled;
 * a shortfall is drawn as an outlined gap after it, up to the target. Money
 * set aside beyond the target leaves the bar full.
 */
export function barShares(cover: ItemCover): { covered: number; short: number } | null {
  if (cover.target === null) return null;
  const covered = Math.min(cover.covered / cover.target, 1);
  const short = Math.min(cover.short / cover.target, 1 - covered);
  return { covered, short };
}

/** The page's one-line summary across active items (shown only for two or more). */
export function summary(covers: readonly ItemCover[]): Backing {
  const setAside = sum(covers.map((c) => c.reserved));
  const short = sum(covers.map((c) => c.short));
  const covered = sum(covers.map((c) => c.covered));
  if (setAside === 0) return { kind: "empty" };
  if (short === 0) return { kind: "covered", setAside };
  return { kind: "short", covered, setAside, short };
}

/** The page's headline facts across active items: how many, and how targets stand. */
export function overview(covers: readonly ItemCover[]): {
  readonly purposes: number;
  /** Σ targets and Σ still needed, over the items that have a target; null when none does. */
  readonly targets: { readonly target: Money; readonly stillNeeded: Money } | null;
} {
  const targeted = covers.filter((c) => c.target !== null && c.stillNeeded !== null);
  return {
    purposes: covers.length,
    targets:
      targeted.length === 0
        ? null
        : {
            target: sum(targeted.map((c) => c.target!)),
            stillNeeded: sum(targeted.map((c) => c.stillNeeded!)),
          },
  };
}

export interface AccountHolding {
  readonly accountId: string;
  readonly name: string;
  /** Σ set aside on this account, across purposes. */
  readonly setAside: Money;
  /** Σ of that the balance no longer backs. */
  readonly short: Money;
  /** The purposes it holds money for, in page order. */
  readonly purposes: readonly string[];
}

/** Where set-aside money sits: one line per account holding any, in order of first appearance. */
export function holdingsByAccount(
  items: readonly {
    readonly name: string;
    readonly holdings: readonly {
      readonly accountId: string;
      readonly accountName: string;
      readonly setAside: Money;
      readonly short: Money;
    }[];
  }[],
): AccountHolding[] {
  const lines = new Map<
    string,
    { name: string; setAside: Money[]; short: Money[]; purposes: string[] }
  >();
  for (const item of items) {
    for (const h of item.holdings) {
      if (h.setAside === 0) continue;
      const line = lines.get(h.accountId) ?? {
        name: h.accountName,
        setAside: [],
        short: [],
        purposes: [],
      };
      line.setAside.push(h.setAside);
      line.short.push(h.short);
      line.purposes.push(item.name);
      lines.set(h.accountId, line);
    }
  }
  return [...lines].map(([accountId, l]) => ({
    accountId,
    name: l.name,
    setAside: sum(l.setAside),
    short: sum(l.short),
    purposes: l.purposes,
  }));
}
