import Link from "next/link";
import type { ReactNode } from "react";

import type { CashFlowPeriod, CashFlowSummary } from "@/domain/ledger/cash-flow";
import { formatMoney, type Money as MoneyValue } from "@/domain/money";

import { activityHref } from "../activity/links";
import { periodNote } from "../cash-flow/labels";
import { rangeLabel } from "../format";
import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { monthFlow, type MonthFlow } from "./describe";
import { ZoneHeader, ZoneLink } from "./zone-header";

/**
 * "How is this month going?" — what came in and what went out, drawn on one
 * scale, and the span between them: what was left over, or how much more went
 * out than came in. Every amount is Cash flow's; the bars only draw them, and
 * no rate or percentage is shown (docs/design-direction.md §5). Came in and
 * Went out open the Activity rows behind them; the zone leads to Cash flow.
 */
export function ThisMonth({
  summary,
  period,
}: {
  readonly summary: CashFlowSummary;
  readonly period: CashFlowPeriod;
}) {
  const { range } = period;
  const flow = monthFlow(summary);
  const drawn = flow.kind === "flow" ? flow : null;
  return (
    <section aria-labelledby="overview-month" className="flex flex-col p-5 md:p-7">
      <ZoneHeader
        id="overview-month"
        title="This month"
        note={periodNote(period)}
        action={<ZoneLink href="/cash-flow">Where it went in Cash flow</ZoneLink>}
      />

      <dl className="mt-5 grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 text-body">
        <Line
          term="Came in"
          amount={summary.income}
          label={`Came in, ${rangeLabel(range)}`}
          href={activityHref({ type: "income", range })}
          bar={drawn && <CameIn flow={drawn} />}
        />
        {/* No type filter: Activity's Spent total is expenses net of refunds, exactly this figure. */}
        <Line
          term="Went out"
          amount={summary.spending}
          label={`Went out, ${rangeLabel(range)}`}
          href={activityHref({ range })}
          bar={drawn && <WentOut flow={drawn} />}
        />
        <span aria-hidden className="col-span-3 h-px bg-line" />
        {/* Each row is a group that shares the list's columns, so every bar is drawn
            on one scale and every amount ends on one edge. */}
        <div className="col-span-3 grid grid-cols-subgrid items-center">
          <dt className="col-span-2 flex items-center gap-2 font-semibold text-navy">
            {drawn?.gap && <Swatch kind={drawn.gap.kind} />}
            Left over
          </dt>
          {/* A true minus when more went out; never berry: it is direction, not an error. */}
          <dd className="text-right text-figure font-bold whitespace-nowrap text-navy">
            <Money amount={summary.leftOver} />
          </dd>
        </div>
      </dl>

      {flow.kind === "empty" && (
        <p className="mt-3 text-meta text-ink-2">Nothing has come in or gone out yet this month.</p>
      )}
    </section>
  );
}

/** One line: its name, its bar (when the month can be drawn) and its amount. */
function Line({
  term,
  amount,
  label,
  href,
  bar,
}: {
  readonly term: string;
  readonly amount: MoneyValue;
  /** What a screen reader hears ("Came in, 1–29 Sep 2026: ৳97,500"). */
  readonly label: string;
  readonly href: string;
  readonly bar: ReactNode;
}) {
  return (
    <div className="col-span-3 grid grid-cols-subgrid items-center">
      <dt className="text-ink-2">{term}</dt>
      <dd className="col-span-2 grid grid-cols-subgrid items-center">
        <span aria-hidden className="block min-w-0">
          {bar}
        </span>
        <span className="text-right font-semibold whitespace-nowrap text-ink">
          {amount !== 0 ? (
            <Link href={href} aria-label={`${label}: ${formatMoney(amount)}`} className={linkClass}>
              <Money amount={amount} />
            </Link>
          ) : (
            <Money amount={amount} />
          )}
        </span>
      </dd>
    </div>
  );
}

const pct = (fraction: number) => `${fraction * 100}%`;

type Drawn = Extract<MonthFlow, { kind: "flow" }>;

/** The track every bar sits on: the shared scale, the longer amount at full length. */
function Track({ children }: { readonly children: ReactNode }) {
  return (
    <span className="relative flex h-3 gap-0.5 overflow-hidden rounded-full bg-surface-subtle">
      {children}
    </span>
  );
}

/**
 * What came in: tide for the part that went out again, and navy for the part
 * left over — the same navy as the Left over figure, so the two read as one.
 */
function CameIn({ flow }: { readonly flow: Drawn }) {
  const left = flow.gap?.kind === "left" ? flow.gap : null;
  const spent = left ? left.from : flow.cameIn;
  return (
    <Track>
      {spent > 0 && <span className="h-full min-w-1 bg-tide" style={{ width: pct(spent) }} />}
      {left && (
        <span className="h-full min-w-1.5 bg-navy" style={{ width: pct(left.to - left.from) }} />
      )}
    </Track>
  );
}

/**
 * What went out, in ocean. When more went out than came in, the part past what
 * came in is outlined, not filled: it is direction, never an error.
 */
function WentOut({ flow }: { readonly flow: Drawn }) {
  const over = flow.gap?.kind === "over" ? flow.gap : null;
  const covered = over ? over.from : flow.wentOut;
  return (
    <Track>
      {covered > 0 && <span className="h-full min-w-1 bg-ocean" style={{ width: pct(covered) }} />}
      {over && (
        <span
          className={cn(
            "h-full min-w-1.5 border-[1.5px] border-ocean bg-surface",
            covered > 0 ? "rounded-r-full" : "rounded-full",
          )}
          style={{ width: pct(over.to - over.from) }}
        />
      )}
    </Track>
  );
}

/** Ties the Left over row to its part of the drawing: navy for left over, an outline for more out. */
function Swatch({ kind }: { readonly kind: "left" | "over" }) {
  return (
    <span
      aria-hidden
      className={cn(
        // A short piece of bar, never a square that could read as a checkbox.
        "h-2.5 w-4 shrink-0 rounded-full",
        kind === "left" ? "bg-navy" : "border-[1.5px] border-ocean bg-surface",
      )}
    />
  );
}
