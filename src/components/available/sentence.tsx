import type { ReactNode } from "react";

import type { Money as MoneyValue } from "@/domain/money";
import type { AvailableView } from "@/server/services/available-service";

import { Money } from "../ui/money";
import { listOf, outcomeOf, spokenFor } from "./describe";

/**
 * Available's hero sentence: one line naming only what actually stands
 * between the balances and the answer. Shared by the Available page and the
 * Overview's Available band, so the two never word it differently; the
 * caller styles the figures in it for its own surface.
 */
export function AvailableSentence({
  view,
  dueBy,
  figureClassName,
}: {
  readonly view: AvailableView;
  /** The horizon end, as the caller shows it ("22 Oct"). */
  readonly dueBy: string;
  readonly figureClassName: string;
}): ReactNode {
  const outcome = outcomeOf(view.available);
  const parts = spokenFor(view, dueBy);
  const list = listOf(parts);
  const List = list.charAt(0).toUpperCase() + list.slice(1);
  if (outcome === "over") {
    return (
      <>
        {List} come to{" "}
        <Money amount={-view.available as MoneyValue} sign="none" className={figureClassName} />{" "}
        more than your accounts hold.
      </>
    );
  }
  if (outcome === "zero") {
    return parts.length > 0 ? (
      <>{List} take up everything in your accounts.</>
    ) : (
      "The accounts that count toward Available hold nothing right now."
    );
  }
  return parts.length > 0 ? (
    <>
      What&apos;s left of{" "}
      <Money amount={view.includedAssetBalances} sign="none" className={figureClassName} /> in your
      accounts after {list}.
    </>
  ) : (
    <>Nothing is owed on cards, due by {dueBy} or set aside: all of it is yours to use.</>
  );
}
