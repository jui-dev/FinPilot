import { ArrowRight } from "lucide-react";
import Link from "next/link";

import type { CalendarDate } from "@/domain/calendar-date";
import type { AttentionSignal } from "@/domain/signals/signals";

import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { Tag } from "../ui/panel";
import { NOTHING_DETAIL, NOTHING_TITLE, SIGNAL_ICONS } from "./attention-list";
import { describeSignal, type AttentionRow, type AttentionTone } from "./describe";

/** How many signals the Overview shows before View all. */
export const PREVIEW_SIGNALS = 3;

/** The tone stripe beside each row repeats its tag's tone; the tag's word carries it. */
const STRIPE: Record<AttentionTone, string> = {
  warning: "bg-warning",
  negative: "bg-negative",
  info: "bg-ocean",
  neutral: "bg-line-strong",
};

/**
 * The Overview's Attention preview: the highest-priority signals, compact and
 * made for scanning. Each row keeps its tag, title, figure and sentence, and
 * one action: the link to the page that owns it. Hide lives in the complete
 * list (View all), not here.
 */
export function AttentionPreview({
  signals,
  today,
  labelledBy,
}: {
  readonly signals: readonly AttentionSignal[];
  readonly today: CalendarDate;
  readonly labelledBy: string;
}) {
  if (signals.length === 0) {
    return (
      <div className="mt-3">
        <p className="text-body font-semibold text-ink">{NOTHING_TITLE}</p>
        <p className="mt-0.5 text-meta text-ink-2">{NOTHING_DETAIL}</p>
      </div>
    );
  }
  return (
    <ul aria-labelledby={labelledBy} className="mt-2 divide-y divide-line">
      {signals.slice(0, PREVIEW_SIGNALS).map((signal) => (
        <PreviewRow key={signal.key} row={describeSignal(signal, today)} />
      ))}
    </ul>
  );
}

function PreviewRow({ row }: { readonly row: AttentionRow }) {
  const Icon = SIGNAL_ICONS[row.tag.icon];
  return (
    <li className="flex gap-3 py-3">
      <span aria-hidden className={cn("w-[3px] shrink-0 rounded-full", STRIPE[row.tag.tone])} />
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Tag tone={row.tag.tone} icon={<Icon aria-hidden className="size-3.5" />}>
            {row.tag.label}
          </Tag>
          <span className="text-body font-semibold wrap-anywhere text-ink">{row.title}</span>
        </p>
        <p
          className={cn(
            "text-right text-body font-semibold whitespace-nowrap tabular-nums",
            row.amount.negative ? "text-negative" : "text-ink",
          )}
        >
          <Money amount={row.amount.value} sign={row.amount.sign} />
          {row.amount.note && <span className="font-normal"> {row.amount.note}</span>}
        </p>
        <p className="col-span-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-meta">
          <span className="min-w-0 text-ink-2">{row.detail}</span>
          {/* Rows can share a label ("Open Commitments"); the name adds the row's title. */}
          <Link
            href={row.evidence.href}
            aria-label={`${row.evidence.label}: ${row.title}`}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 font-medium text-ocean max-md:min-h-10",
              linkClass,
            )}
          >
            {row.evidence.label}
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </p>
      </div>
    </li>
  );
}
