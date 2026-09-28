import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CircleAlert,
  Scale,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

import type { CalendarDate } from "@/domain/calendar-date";
import type { AttentionSignal } from "@/domain/signals/signals";

import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { Tag } from "../ui/panel";
import { describeSignal, type AttentionIcon, type AttentionRow } from "./describe";
import { HideButton } from "./hide-button";
import { ShowMoreList } from "./show-more";

const CARD = "overflow-clip rounded-panel border border-line bg-surface shadow-card";

const ICONS: Record<AttentionIcon, typeof CalendarClock> = {
  calendar: CalendarClock,
  "calendar-soon": CalendarDays,
  alert: CircleAlert,
  mismatch: ShieldAlert,
  trend: TrendingUp,
  scale: Scale,
};

/**
 * "What actually needs my attention right now?" — the Attention signals, in
 * their fixed priority order, as one list. Each row says what happened, why
 * it matters, the figure it is about, and links to the page that owns it; the
 * two kinds nothing else resolves can be hidden. The first `initial` rows
 * show, and the rest open in place. With nothing to show, one compact strip
 * says so plainly. The surrounding page supplies the heading (`labelledBy`).
 */
export function AttentionList({
  signals,
  today,
  labelledBy,
  initial = 3,
  className,
}: {
  readonly signals: readonly AttentionSignal[];
  readonly today: CalendarDate;
  /** The id of the heading that names the list; it also takes focus after Hide. */
  readonly labelledBy: string;
  /** How many rows show before **Show N more**. */
  readonly initial?: number;
  readonly className?: string;
}) {
  if (signals.length === 0) {
    return (
      <section aria-labelledby={labelledBy} className={cn(CARD, "px-4 py-4 md:px-5", className)}>
        <p className="text-body font-semibold text-ink">Nothing needs your attention</p>
        <p className="mt-0.5 text-meta text-ink-2">
          No payment, money set aside, verified balance or change in spending needs a look right
          now.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby={labelledBy} className={cn(CARD, className)}>
      <ShowMoreList id={`${labelledBy}-list`} initial={initial}>
        {signals.map((signal) => (
          <SignalRow key={signal.key} row={describeSignal(signal, today)} focusId={labelledBy} />
        ))}
      </ShowMoreList>
    </section>
  );
}

function SignalRow({ row, focusId }: { readonly row: AttentionRow; readonly focusId: string }) {
  const Icon = ICONS[row.tag.icon];
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 px-4 py-4 md:px-5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {/* The shared Tag palette: warning, berry for short, ocean on mist, neutral. */}
        <Tag tone={row.tag.tone} icon={<Icon aria-hidden className="size-3.5" />}>
          {row.tag.label}
        </Tag>
      </div>
      <p
        className={cn(
          "text-right text-body font-semibold whitespace-nowrap",
          row.amount.negative ? "text-negative" : "text-ink",
        )}
      >
        <Money amount={row.amount.value} sign={row.amount.sign} />
        {row.amount.note && <span className="font-normal"> {row.amount.note}</span>}
      </p>

      <p className="col-span-2 text-body font-semibold wrap-anywhere text-ink">{row.title}</p>
      <p className="col-span-2 max-w-[68ch] text-meta text-ink-2">{row.detail}</p>

      <div className="col-span-2 mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        {/* Rows can share a label ("Open Commitments"), so the name adds the
            row's title, after the visible label so the name still starts with it. */}
        <Link
          href={row.evidence.href}
          aria-label={`${row.evidence.label}: ${row.title}`}
          className={cn(
            "inline-flex min-h-8 items-center gap-1.5 text-meta font-medium text-ocean max-md:min-h-10",
            linkClass,
          )}
        >
          {row.evidence.label}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
        {row.hide && (
          <HideButton
            signalKey={row.key}
            title={row.title}
            until={row.hide.until}
            focusId={focusId}
          />
        )}
      </div>
    </li>
  );
}
