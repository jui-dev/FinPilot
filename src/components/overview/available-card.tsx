import { ArrowRight, CircleAlert } from "lucide-react";
import Link from "next/link";

import { formatMoney, type Money as MoneyValue } from "@/domain/money";
import type { AvailableView } from "@/server/services/available-service";

import { outcomeOf } from "../available/describe";
import { AvailableSentence } from "../available/sentence";
import { shortDate } from "../format";
import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { Tag } from "../ui/panel";
import { availableRing, type AvailableRing, type RingArc, type RingKind } from "./describe";

/**
 * The Overview's headline: how much is free to use right now. It reads in one
 * order — Available now, the figure, the sentence that explains it — and only
 * then the ring, which divides the money on hand as the Available page's
 * spoken-for bar does, with a compact legend. Every amount is the Available
 * read model's; the ring and legend never add anything up.
 *
 * Phones and the spread (from 1024px, beside Your month) stack the answer over
 * the ring; at 768px the card is the page's width and the ring sits beside it.
 */
export function AvailableCard({
  view,
  className,
}: {
  readonly view: AvailableView;
  readonly className?: string;
}) {
  const outcome = outcomeOf(view.available);
  const ring = availableRing(view);
  const dueBy = shortDate(view.horizonEnd, view.today);
  return (
    <section
      aria-labelledby="overview-available"
      className={cn(
        "relative isolate flex flex-col overflow-clip rounded-panel border border-line bg-surface p-5 shadow-card",
        "md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-10 md:p-7",
        "lg:flex lg:items-stretch",
        className,
      )}
    >
      {/* A quiet wash of mist behind the ring's corner: the card's own light, never a status. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_100%_0%,var(--color-mist)_0%,transparent_55%)] opacity-70"
      />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 id="overview-available" className="text-heading font-bold text-navy">
            Available now
          </h2>
          <Tag tone="info">Before new income</Tag>
        </div>
        {/* The figure keeps navy and a true minus when negative; only the gap is berry. */}
        <p className="mt-3 text-hero font-bold text-navy tabular-nums">
          <Money amount={view.available} />
        </p>
        {outcome === "over" && (
          <p className="mt-3">
            <Tag tone="negative" icon={<CircleAlert aria-hidden className="size-3.5" />}>
              Over-committed by <Money amount={-view.available as MoneyValue} sign="none" />
            </Tag>
          </p>
        )}
        <p className="mt-4 max-w-md text-body text-ink-2">
          <AvailableSentence view={view} dueBy={dueBy} figureClassName="font-semibold text-ink" />
        </p>
        <Link
          href="/available"
          className={cn(
            "mt-3 inline-flex min-h-8 items-center gap-1.5 text-meta font-medium text-ocean max-md:min-h-10",
            linkClass,
          )}
        >
          See how it&apos;s worked out
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>

      <div className="mt-5 border-t border-line pt-5 md:mt-0 md:border-t-0 md:pt-0 lg:mt-auto lg:border-t lg:pt-6">
        {ring ? <Ring ring={ring} available={view.available} dueBy={dueBy} /> : <NothingOnHand />}
      </div>
    </section>
  );
}

const SIZE = 120;
const STROKE = 13;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** The space left between two arcs, in the ring's units. */
const GAP = 2.5;

/**
 * Each part's mark, as the Available page's bar draws it: filled navy for
 * money that exists and is free, tide for set aside, mist with an ocean edge
 * for payments expected, ink-3 for what is owed, and an over-commitment as a
 * berry-edged gap (never a solid berry).
 */
const ARC: Record<RingKind, { readonly stroke: string; readonly inner?: string }> = {
  available: { stroke: "stroke-navy" },
  owed: { stroke: "stroke-ink-3" },
  payments: { stroke: "stroke-ocean", inner: "stroke-mist" },
  setAside: { stroke: "stroke-tide" },
  over: { stroke: "stroke-negative", inner: "stroke-negative-soft" },
};

const SWATCH: Record<RingKind, string> = {
  available: "bg-navy",
  owed: "bg-ink-3",
  payments: "bg-mist shadow-[inset_0_0_0_1.5px_var(--color-ocean)]",
  setAside: "bg-tide",
  over: "bg-negative-soft shadow-[inset_0_0_0_1.5px_var(--color-negative)]",
};

/**
 * The money on hand as one ring, with the pool in its middle and each part
 * named beside it. The drawing is hidden from assistive technology; the
 * legend lists the parts, and one sentence says what is free precisely.
 */
function Ring({
  ring,
  available,
  dueBy,
}: {
  readonly ring: AvailableRing;
  readonly available: MoneyValue;
  readonly dueBy: string;
}) {
  const label: Record<RingKind, string> = {
    available: "Available",
    owed: "Owed on cards",
    payments: `Due by ${dueBy}`,
    setAside: "Set aside",
    over: "Over-committed",
  };
  const pool = formatMoney(ring.pool);
  const gap = ring.arcs.length > 1 ? GAP : 0;
  return (
    <figure className="flex items-center gap-5 md:gap-7">
      <div className="relative size-32 shrink-0 md:size-40 lg:size-44 xl:size-48">
        <svg
          aria-hidden
          data-testid="available-ring"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="size-full -rotate-90"
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-surface-hover"
          />
          {ring.arcs.map((arc) => (
            <Arc key={arc.kind} arc={arc} gap={gap} />
          ))}
        </svg>
        <span aria-hidden className="absolute inset-0 grid place-content-center text-center">
          <span className="text-body font-bold text-ink tabular-nums">
            <Money amount={ring.pool} sign="none" />
          </span>
          <span className="text-micro text-ink-2">on hand</span>
        </span>
      </div>
      <figcaption className="min-w-0 flex-1">
        <ul className="grid max-w-72 gap-y-1.5 text-meta">
          {ring.arcs.map((arc) => (
            <li key={arc.kind} className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn("size-2.5 shrink-0 rounded-full", SWATCH[arc.kind])}
              />
              <span
                className={cn(
                  "min-w-0 flex-1",
                  arc.kind === "over" ? "text-negative" : "text-ink-2",
                )}
              >
                {label[arc.kind]}
              </span>
              <Money
                amount={arc.amount}
                sign="none"
                className={cn(
                  "font-semibold tabular-nums",
                  arc.kind === "over" ? "text-negative" : "text-ink",
                )}
              />
            </li>
          ))}
        </ul>
        <span className="sr-only">
          {available > 0
            ? `Free: ${formatMoney(available)} of the ${pool} on hand in the accounts and cards that count toward Available.`
            : `Nothing is free of the ${pool} on hand in the accounts and cards that count toward Available.`}
        </span>
      </figcaption>
    </figure>
  );
}

function Arc({ arc, gap }: { readonly arc: RingArc; readonly gap: number }) {
  const { stroke, inner } = ARC[arc.kind];
  // A part too small to see still shows as a sliver, never as nothing.
  const length = Math.max(arc.length * CIRCUMFERENCE - gap, 1.5);
  const circle = (className: string, width: number) => (
    <circle
      cx={SIZE / 2}
      cy={SIZE / 2}
      r={RADIUS}
      fill="none"
      strokeWidth={width}
      strokeDasharray={`${length} ${CIRCUMFERENCE}`}
      strokeDashoffset={-(arc.start * CIRCUMFERENCE + gap / 2)}
      className={className}
    />
  );
  return (
    <>
      {circle(stroke, STROKE)}
      {/* Expected and missing parts are a tint inside an edge, as on the bar. */}
      {inner && circle(inner, STROKE - 3.5)}
    </>
  );
}

/** With nothing on hand there is nothing for the parts to be of: words instead of a ring. */
function NothingOnHand() {
  return (
    <p className="max-w-xs">
      <span className="block text-figure font-semibold text-navy">Nothing on hand</span>
      <span className="mt-1 block text-meta text-ink-2">
        in the accounts and cards that count toward Available
      </span>
    </p>
  );
}
