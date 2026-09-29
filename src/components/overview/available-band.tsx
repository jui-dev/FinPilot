import { ArrowRight, CircleAlert } from "lucide-react";
import Link from "next/link";

import { formatMoney, type Money as MoneyValue } from "@/domain/money";
import type { AvailableView } from "@/server/services/available-service";

import { outcomeOf } from "../available/describe";
import { AvailableSentence } from "../available/sentence";
import { shortDate } from "../format";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { Tag } from "../ui/panel";
import { freeShare, type FreeShare } from "./describe";

/**
 * The Overview's headline: Available, on the product's one navy surface
 * (docs/design-direction.md §2, §6). Three groups: the answer (the hero figure
 * and its tags), the free-share ring with the money on hand it is a share of,
 * and the explanation (Available's own sentence and the way to its bridge).
 * It never redraws the bridge or the spoken-for bar.
 *
 * Phones stack the groups, the ring beside its words. At 768px the band is
 * wide: the answer and the explanation on the left, the ring on the right.
 * From 1024px, where the band is the left page of the spread, the groups
 * stack again with a larger ring, the panel only as tall as they need.
 */
export function AvailableBand({
  view,
  className,
}: {
  readonly view: AvailableView;
  readonly className?: string;
}) {
  const outcome = outcomeOf(view.available);
  const share = freeShare(view);
  return (
    <section
      aria-labelledby="overview-available"
      className={cn(
        "grid gap-6 rounded-panel bg-navy p-5 text-white shadow-card md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-10 md:p-7",
        "lg:grid-cols-1 lg:gap-7",
        // Focus rings stay visible on navy.
        "[&_:focus-visible]:outline-mist",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 id="overview-available" className="text-body font-semibold text-white/85">
          Available now
        </h2>
        {/* White on navy, with a true minus when negative; berry never sits on navy. */}
        <p className="mt-2 text-hero font-bold">
          <Money amount={view.available} />
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {outcome === "over" && (
            <Tag tone="negative" icon={<CircleAlert aria-hidden className="size-3.5" />}>
              Over-committed by <Money amount={-view.available as MoneyValue} sign="none" />
            </Tag>
          )}
          <Tag tone="info">Before new income</Tag>
        </div>
      </div>

      <div className="md:row-span-2 md:self-center lg:row-span-1">
        {share ? <FreeShare share={share} available={view.available} /> : <NothingOnHand />}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <p className="max-w-md text-body text-white/85 lg:text-heading lg:font-normal">
          <AvailableSentence
            view={view}
            dueBy={shortDate(view.horizonEnd, view.today)}
            figureClassName="font-semibold text-white"
          />
        </p>
        <Link
          href="/available"
          className="inline-flex min-h-8 items-center gap-1.5 self-start text-body font-medium text-white underline decoration-white/50 underline-offset-4 transition-colors hover:decoration-white max-md:min-h-10"
        >
          See how it&apos;s worked out
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </section>
  );
}

const SIZE = 96;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * FinPilot's only ring: one arc of what is free against the money on hand —
 * the Available pool, the counted balances plus any card credit — starting at
 * the top and running clockwise. No percentage, no score, no thresholds. The
 * drawing and its short words are hidden from assistive technology; one
 * sentence says the same precisely.
 */
function FreeShare({
  share,
  available,
}: {
  readonly share: NonNullable<FreeShare>;
  readonly available: MoneyValue;
}) {
  // A free amount too small to see still shows as a sliver, never as nothing.
  const arc = share.free === null ? 0 : Math.max(share.fraction, 0.015) * CIRCUMFERENCE;
  const pool = formatMoney(share.pool);
  return (
    <figure className="flex items-center gap-4 md:flex-col md:gap-3 md:text-center lg:flex-row lg:gap-6 lg:text-left">
      <svg
        aria-hidden
        data-testid="free-share-ring"
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="size-28 shrink-0 md:size-36 lg:size-48 xl:size-60"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-white/15"
        />
        {arc > 0 && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeDasharray={`${arc} ${CIRCUMFERENCE}`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            className="stroke-mist"
          />
        )}
      </svg>
      <figcaption>
        <span aria-hidden className="block">
          {share.free === null && (
            <span className="mb-1 block text-body font-semibold text-white">Nothing free</span>
          )}
          <span className="block text-body text-white/85">of</span>
          <span className="block text-figure font-semibold text-white">
            <Money amount={share.pool} sign="none" />
          </span>
          <span className="block text-body text-white/85">on hand</span>
        </span>
        <span className="sr-only">
          {share.free === null
            ? `Nothing is free of the ${pool} on hand in the accounts and cards that count toward Available.`
            : `Free: ${formatMoney(available)} of the ${pool} on hand in the accounts and cards that count toward Available.`}
        </span>
      </figcaption>
    </figure>
  );
}

/** With nothing on hand there is nothing for a share to be of: words instead of a ring. */
function NothingOnHand() {
  return (
    <p className="max-w-xs">
      <span className="block text-figure font-semibold text-white">Nothing on hand</span>
      <span className="mt-1 block text-body text-white/85">
        in the accounts and cards that count toward Available
      </span>
    </p>
  );
}
