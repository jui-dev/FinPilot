import { ArrowRight } from "lucide-react";
import Link from "next/link";

import type { CalendarDate } from "@/domain/calendar-date";
import type { AttentionSignal } from "@/domain/signals/signals";

import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { Tag } from "../ui/panel";
import { NOTHING_DETAIL, NOTHING_TITLE, SIGNAL_ICONS } from "./attention-list";
import { describeSignal, type AttentionRow, type AttentionTone } from "./describe";

/** How many signals the Overview shows before View all. */
export const PREVIEW_SIGNALS = 3;

/**
 * The icon tile beside each card's tag, in the tag's own tone (the shared Tag
 * palette): amber for a decision to make, berry for a shortfall, ocean on mist
 * for what is coming up, neutral otherwise. The card itself stays neutral.
 */
const TILE: Record<AttentionTone, string> = {
  warning: "bg-warning-soft text-warning",
  negative: "bg-negative-soft text-negative",
  info: "bg-mist text-ocean",
  neutral: "bg-surface text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]",
};

/**
 * The Overview's Attention preview: the highest-priority signals as small,
 * neutral cards, made for a glance — the kind (an icon tile and the tag), what
 * it is about, and the figure. Each card is one link, to the page that owns
 * it; why it matters and Hide live in the complete list (View all).
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
    <ul aria-labelledby={labelledBy} className="mt-3 grid gap-3 md:grid-cols-3 md:gap-4">
      {signals.slice(0, PREVIEW_SIGNALS).map((signal) => (
        <SignalCard key={signal.key} row={describeSignal(signal, today)} />
      ))}
    </ul>
  );
}

function SignalCard({ row }: { readonly row: AttentionRow }) {
  const Icon = SIGNAL_ICONS[row.tag.icon];
  return (
    <li
      className={cn(
        "group relative flex min-w-0 flex-col gap-3 rounded-panel border border-line bg-surface-subtle p-4 transition-colors",
        "hover:bg-surface-hover has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ocean has-[a:focus-visible]:outline-solid",
      )}
    >
      <p className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-control",
            TILE[row.tag.tone],
          )}
        >
          <Icon className="size-4" />
        </span>
        <Tag tone={row.tag.tone}>{row.tag.label}</Tag>
      </p>
      <div className="flex min-w-0 flex-col gap-0.5 max-md:flex-row max-md:items-baseline max-md:justify-between max-md:gap-4">
        <p className="min-w-0 text-heading font-semibold wrap-anywhere text-ink">{row.subject}</p>
        <p
          className={cn(
            "text-figure font-bold whitespace-nowrap tabular-nums max-md:text-heading",
            row.amount.negative ? "text-negative" : "text-navy",
          )}
        >
          <Money amount={row.amount.value} sign={row.amount.sign} />
          {row.amount.note && <span className="text-meta font-medium"> {row.amount.note}</span>}
        </p>
      </div>
      {/* The whole card is this link. Cards can share a label ("Open Commitments"),
          so its name adds the signal's title, after the visible label. */}
      <Link
        href={row.evidence.href}
        aria-label={`${row.evidence.label}: ${row.title}`}
        className={cn(
          "mt-auto inline-flex items-center gap-1 self-start text-meta font-medium text-ocean outline-none",
          "after:absolute after:inset-0 after:rounded-panel after:content-['']",
        )}
      >
        {row.evidence.label}
        <ArrowRight
          aria-hidden
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
        />
      </Link>
    </li>
  );
}
