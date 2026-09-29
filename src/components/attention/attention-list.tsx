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

/** Each kind's icon, shared by the full list and the Overview's preview. */
export const SIGNAL_ICONS: Record<AttentionIcon, typeof CalendarClock> = {
  calendar: CalendarClock,
  "calendar-soon": CalendarDays,
  alert: CircleAlert,
  mismatch: ShieldAlert,
  trend: TrendingUp,
  scale: Scale,
};

/** What the empty state says, wherever Attention has nothing to show. */
export const NOTHING_TITLE = "Nothing needs your attention";
export const NOTHING_DETAIL =
  "No payment, money set aside, verified balance or change in spending needs a look right now.";

/**
 * "What actually needs my attention right now?" — every Attention signal, in
 * the fixed priority order, as one list: what happened, why it matters, the
 * figure it is about, a link to the page that owns it, and Hide on the two
 * kinds nothing else resolves. It is the complete list the Overview's View all
 * opens; the surface around it (the sheet) supplies the heading (`labelledBy`).
 */
export function AttentionList({
  signals,
  today,
  labelledBy,
  className,
}: {
  readonly signals: readonly AttentionSignal[];
  readonly today: CalendarDate;
  /** The id of the heading that names the list; it also takes focus after Hide. */
  readonly labelledBy: string;
  readonly className?: string;
}) {
  if (signals.length === 0) {
    return (
      <section aria-labelledby={labelledBy} className={cn("py-4", className)}>
        <p className="text-body font-semibold text-ink">{NOTHING_TITLE}</p>
        <p className="mt-0.5 text-meta text-ink-2">{NOTHING_DETAIL}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby={labelledBy} className={className}>
      <ul className="divide-y divide-line">
        {signals.map((signal) => (
          <SignalRow key={signal.key} row={describeSignal(signal, today)} focusId={labelledBy} />
        ))}
      </ul>
    </section>
  );
}

function SignalRow({ row, focusId }: { readonly row: AttentionRow; readonly focusId: string }) {
  const Icon = SIGNAL_ICONS[row.tag.icon];
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 py-4">
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
