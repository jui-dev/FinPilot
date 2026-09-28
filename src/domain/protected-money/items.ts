import type { Ratio } from "@/domain/ledger/analytics";
import { subtract, sum, ZERO, type Money } from "@/domain/money";

import type { BackedEarmark } from "./earmarks";

/**
 * Protected-money items: what money is set aside for (docs/domain-model.md §9).
 * Shown to the person as "Set aside"; there is no separate Goals concept.
 *
 * A target is intention only: it never reserves, releases or backs anything,
 * and it never enters Available. With a target an item is goal-like; without
 * one it is reserve-like and has no progress. A target date, on-track and a
 * required monthly contribution are deferred beyond V1.
 */

export type ItemRuleCode = "invalid_target" | "still_reserved";

export interface ItemRuleViolation {
  readonly code: ItemRuleCode;
  readonly message: string;
}

/** A target is optional; when stated it is a positive amount. */
export function checkTarget(target: Money | null): ItemRuleViolation | undefined {
  if (target === null) return undefined;
  if (!Number.isSafeInteger(target) || target <= 0) {
    return { code: "invalid_target", message: "The target must be more than zero." };
  }
  return undefined;
}

/** An item is archived only when nothing remains reserved on any account. */
export function checkArchive(reserved: Money): ItemRuleViolation | undefined {
  if (reserved === 0) return undefined;
  return {
    code: "still_reserved",
    message: "Release everything set aside for it before archiving.",
  };
}

/** An item's position, across every account its earmarks are on. */
export interface ItemCover {
  /** Σ nominally reserved. */
  readonly reserved: Money;
  /** Σ backed by real money; what counts toward the target. */
  readonly covered: Money;
  /** Σ shortfall = reserved − covered. */
  readonly short: Money;
  readonly target: Money | null;
  /** max(target − covered, 0); null without a target. */
  readonly stillNeeded: Money | null;
  /**
   * covered / target, exact and unclamped (over-covering reads above 100%);
   * null without a target. Rounded once, at presentation (formatPercent).
   */
  readonly progress: Ratio | null;
  /** covered ≥ target. Derived only: it releases nothing. Null without a target. */
  readonly targetReached: boolean | null;
}

/**
 * Derives an item's cover from its backed earmarks. Progress and still needed
 * come from what real money covers, never from what is nominally reserved, so
 * a shortfall never makes an item look closer to its target.
 */
export function itemCover(target: Money | null, earmarks: readonly BackedEarmark[]): ItemCover {
  const broken = checkTarget(target);
  if (broken) throw new RangeError(broken.message);
  const reserved = sum(earmarks.map((e) => e.reserved));
  const covered = sum(earmarks.map((e) => e.covered));
  const short = subtract(reserved, covered);
  if (target === null) {
    return {
      reserved,
      covered,
      short,
      target,
      stillNeeded: null,
      progress: null,
      targetReached: null,
    };
  }
  const gap = subtract(target, covered);
  return {
    reserved,
    covered,
    short,
    target,
    stillNeeded: gap > 0 ? gap : ZERO,
    progress: { numerator: covered, denominator: target },
    targetReached: covered >= target,
  };
}
