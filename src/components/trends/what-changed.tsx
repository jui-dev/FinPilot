import { listOf } from "../available/describe";
import { CARD } from "../cash-flow/labels";
import { ChangeBand, Explanation } from "../cash-flow/what-changed";
import { cn } from "../ui/cn";
import { EmptyState } from "../ui/panel";
import type { TrendChange } from "@/server/services/analysis-service";

import { monthsCount, monthSpan, shortMonth } from "./describe";

/** "Mar–May": a half's column heading; its full span ("Mar–May 2026") is the title. */
const halfLabel = (months: readonly string[]) =>
  months.length === 1
    ? shortMonth(months[0]!)
    : `${shortMonth(months[0]!)}–${shortMonth(months[months.length - 1]!)}`;

/**
 * "Why is the recent period different?" (Trends). The recent half of the
 * window against the earlier half, laid out as Cash flow's What changed so the
 * two read alike: the headline, then each category that moved it with both
 * halves (each opening its rows in Activity), the exact change and a bar
 * either side of a centre line. The explanation, the materiality rule and
 * every figure are the domain's. Trends carries no percentages, so no share
 * of the increase.
 */
export function TrendWhatChanged({
  change,
  className,
}: {
  readonly change: TrendChange;
  readonly className?: string;
}) {
  const { earlier, recent, explanation: e } = change;
  const quiet = e.increases.length === 0 && e.offsets.length === 0 && e.unchanged.length === 0;
  return (
    <section aria-labelledby="trends-change" className={cn(CARD, "overflow-clip", className)}>
      <ChangeBand
        id="trends-change"
        net={e.net}
        headline={!quiet}
        note={`The recent ${monthsCount(recent.months.length)} against the earlier ${monthsCount(earlier.months.length)}.`}
      />
      {quiet ? (
        <EmptyState title="Nothing went out in either half" />
      ) : (
        <>
          <Explanation
            explanation={e}
            labels={{ previous: halfLabel(earlier.months), current: halfLabel(recent.months) }}
            names={{ previous: monthSpan(earlier.months), current: monthSpan(recent.months) }}
            ranges={{ previous: earlier.range, current: recent.range }}
            shares={false}
          />
          {e.unchanged.length > 0 && (
            <p className="-mt-1 px-5 pb-5 text-meta text-ink-2 md:px-7">
              No change: {listOf(e.unchanged.map((l) => l.name))}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
