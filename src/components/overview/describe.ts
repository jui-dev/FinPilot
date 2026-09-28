import type { Money } from "@/domain/money";
import type { AvailableView } from "@/server/services/available-service";

/**
 * How the Overview draws what the read models already say. Every amount is
 * the Available read model's or the position's; nothing here adds up money.
 * This only decides whether each visual can say something true, and turns the
 * amounts it is given into the fractions it is drawn with.
 */

/**
 * The free-share ring (docs/design-direction.md §5): Available against the
 * bridge's pool. No ring when the pool is ≤ 0, since there is nothing for a
 * share to be of; an empty track when nothing is free (Available ≤ 0), the
 * over-commitment tag carrying the rest.
 */
export type FreeShare = {
  /** What is free: Available, or nothing when Available is ≤ 0. */
  readonly free: Money | null;
  readonly pool: Money;
  /** The arc to draw, 0–1. Geometry only; never shown as a number. */
  readonly fraction: number;
} | null;

export function freeShare(view: Pick<AvailableView, "available" | "pool">): FreeShare {
  const { available, pool } = view;
  if (pool <= 0) return null;
  if (available <= 0) return { free: null, pool, fraction: 0 };
  // Available never exceeds the pool (the bridge's invariant); the clamp only
  // keeps the drawing inside its circle.
  return { free: available, pool, fraction: Math.min(available / pool, 1) };
}

export interface RailPart {
  readonly amount: Money;
  /** Its part of the rail, 0–1. */
  readonly share: number;
}

/**
 * What you own, in two parts (docs/design-direction.md §5): the asset balances
 * that count toward Available and those outside it, both from the Available
 * read model, with the outside accounts named. Drawn only when both parts are
 * ≥ 0 and assets are above zero; otherwise a two-part rail cannot be true.
 */
export type AssetRail = {
  readonly counts: RailPart;
  readonly outside: RailPart & { readonly accounts: readonly string[] };
} | null;

export function assetRail(view: AvailableView, assets: Money): AssetRail {
  const { includedAssetBalances: counts, excludedAssetBalances: outside } = view;
  if (counts < 0 || outside < 0 || assets <= 0) return null;
  return {
    counts: { amount: counts, share: counts / assets },
    outside: {
      amount: outside,
      share: outside / assets,
      // Names only, for the words; the amount is the read model's.
      accounts: view.accounts
        .filter((a) => a.accountClass === "asset" && !a.counted && a.balance !== 0)
        .map((a) => a.name),
    },
  };
}
