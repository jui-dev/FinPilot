import { ArrowRight, CircleAlert } from "lucide-react";
import Link from "next/link";

import type { Money as MoneyValue } from "@/domain/money";
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
 * (docs/design-direction.md §2). The figure, *Before new income*, the
 * over-commitment tag when there is one, and Available's own sentence, then
 * the free-share ring. It explains nothing further: the bridge lives on
 * /available, and the band leads there.
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
        "flex flex-col gap-5 rounded-panel bg-navy px-5 py-5 text-white shadow-card md:px-7 md:py-6 xl:self-start",
        // Focus rings stay visible on navy.
        "[&_:focus-visible]:outline-mist",
        className,
      )}
    >
      {/* Phones to laptops: the ring beside the figure. From 1280px, where the band
          sits beside Attention, the ring takes its own row with its words beside it. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-5 gap-y-3 xl:grid-cols-1 xl:gap-y-6">
        <div className="min-w-0">
          <h2 id="overview-available" className="text-body font-semibold text-white/85">
            Available now
          </h2>
          {/* White on navy, with a true minus when negative; berry never sits on navy. */}
          <p className="mt-1 text-display font-bold">
            <Money amount={view.available} />
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {outcome === "over" && (
              <Tag tone="negative" icon={<CircleAlert aria-hidden className="size-3.5" />}>
                Over-committed by <Money amount={-view.available as MoneyValue} sign="none" />
              </Tag>
            )}
            <Tag tone="info">Before new income</Tag>
          </div>
        </div>
        {share && <FreeShareRing share={share} />}
        <p className="col-span-2 max-w-lg text-body text-white/85 xl:col-span-1">
          <AvailableSentence
            view={view}
            dueBy={shortDate(view.horizonEnd, view.today)}
            figureClassName="font-semibold text-white"
          />
        </p>
      </div>
      <Link
        href="/available"
        className="mt-auto inline-flex min-h-8 items-center gap-1.5 self-start text-body font-medium text-white underline decoration-white/50 underline-offset-4 transition-colors hover:decoration-white max-md:min-h-10"
      >
        See how it&apos;s worked out
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}

const SIZE = 96;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * FinPilot's only ring: one arc of what is free against the pool, starting at
 * the top and running clockwise. No percentage, no score, no thresholds; the
 * words beside it carry the amounts, and the drawing is hidden from assistive
 * technology.
 */
function FreeShareRing({ share }: { readonly share: NonNullable<FreeShare> }) {
  // A free amount too small to see still shows as a sliver, never as nothing.
  const arc = share.free === null ? 0 : Math.max(share.fraction, 0.015) * CIRCUMFERENCE;
  return (
    <div className="flex flex-col items-center gap-2 text-center xl:flex-row xl:gap-5 xl:text-left">
      <svg
        aria-hidden
        data-testid="free-share-ring"
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="size-20 shrink-0 md:size-24 xl:size-32"
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
      <p className="text-meta leading-tight text-white/85 xl:text-body">
        {share.free === null ? (
          <span className="block font-semibold text-white">Nothing free</span>
        ) : (
          <span className="block">
            Free <Money amount={share.free} sign="none" className="font-semibold text-white" />
          </span>
        )}{" "}
        {/* Two lines on screen, one phrase when read: the space keeps them apart. */}
        <span className="block">
          of <Money amount={share.pool} sign="none" />
        </span>
      </p>
    </div>
  );
}
