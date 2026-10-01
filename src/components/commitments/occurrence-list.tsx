import { CalendarClock, CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { toParts, type CalendarDate } from "@/domain/calendar-date";
import type { PendingTiming } from "@/domain/commitments/occurrences";
import { sum, type Money as MoneyValue } from "@/domain/money";

import { longDate, shortDate } from "../format";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { Tag } from "../ui/panel";
import type { Choice } from "./commitment-panel";
import { pluralPayments, timingPhrase } from "./describe";
import { OccurrenceActions } from "./occurrence-actions";

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A Commitments card: white, a whisper of an edge, a soft lift (as on Available). */
export const CARD = "overflow-clip rounded-panel border border-line-soft bg-surface shadow-card";

/**
 * From lg, where the four lists sit two by two, they share one size so the
 * grid stays aligned however many rows each holds: the heading and footnote
 * stay put and only the rows scroll. Below lg the lists stack and take their
 * natural height, so the page is the only thing that scrolls.
 */
export const FIXED = "flex flex-col lg:h-[28rem]";

/** The part of a card that scrolls, from lg. */
export const SCROLL = "min-h-0 flex-1 lg:scrollbar-subtle lg:overflow-y-auto lg:overscroll-contain";

/** The warm wash Needs attention sits on: the same sand as Available's evidence, never a status. */
const WARM =
  "bg-[radial-gradient(120%_90%_at_0%_0%,color-mix(in_srgb,var(--color-coral)_6%,var(--color-surface-subtle))_0%,var(--color-surface-subtle)_45%,var(--color-surface)_100%)]";

/** "October 2026" → the month's name, with the year only when it is not this year's. */
export function monthOf(date: CalendarDate, today: CalendarDate): string {
  const { year, month } = toParts(date);
  return `${MONTHS_LONG[month - 1]}${year === toParts(today).year ? "" : ` ${year}`}`;
}

/** Rows grouped by calendar month, in the order they come. */
export function byMonth<T extends { readonly dueOn: CalendarDate }>(
  rows: readonly T[],
  today: CalendarDate,
): { readonly label: string; readonly rows: readonly T[] }[] {
  const groups: { label: string; rows: T[] }[] = [];
  for (const row of rows) {
    const label = monthOf(row.dueOn, today);
    const last = groups.at(-1);
    if (last?.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  return groups;
}

/** Overdue: a status (icon + word + colour) in the warning ink, on white rather than a yellow fill. */
export function OverdueTag({ children }: { readonly children: ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-full bg-surface px-2 text-micro font-semibold whitespace-nowrap text-warning shadow-[inset_0_0_0_1px_var(--color-line)]">
      <CircleAlert aria-hidden className="size-3.5" />
      <span>{children}</span>
    </span>
  );
}

export interface PendingRow {
  readonly id: string;
  readonly name: string;
  readonly dueOn: CalendarDate;
  readonly timing: PendingTiming;
  readonly expectedAmount: MoneyValue;
  readonly categoryName: string;
  readonly expectedAccountId: string | null;
  /** The usual account's name, when there is one. */
  readonly accountName: string | null;
}

/**
 * One list of obligations still to settle, in due order: "Needs attention"
 * (overdue or due today — a decision is needed now) or "Coming up". Each row
 * reads: when, what, how much is expected, and the two ways to settle it.
 */
export function OccurrenceList({
  id,
  title,
  note,
  rows,
  empty,
  accounts,
  today,
  attention,
  footnote,
  className,
}: {
  readonly id: string;
  readonly title: string;
  readonly note: ReactNode;
  readonly rows: readonly PendingRow[];
  readonly empty: ReactNode;
  readonly accounts: readonly Choice[];
  readonly today: CalendarDate;
  readonly attention: boolean;
  /** A closing line under the rows. */
  readonly footnote?: ReactNode;
  /** Where the card sits in the page's grid. */
  readonly className?: string;
}) {
  const item = (row: PendingRow) => (
    <PendingItem key={row.id} row={row} accounts={accounts} today={today} attention={attention} />
  );
  return (
    <section aria-labelledby={id} className={cn(CARD, FIXED, attention && WARM, className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 shrink-0 border-b border-line-soft px-4 py-3.5 md:px-5">
        <h2 id={id} className="flex items-center gap-2 text-heading font-bold text-navy">
          {attention && <span aria-hidden className="size-2 rounded-full bg-warning" />}
          {title}
        </h2>
        <p className="text-meta text-ink-2">{note}</p>
      </div>
      <div className={SCROLL}>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-body text-ink-2 md:px-5">{empty}</p>
        ) : attention ? (
          <ul>{rows.map(item)}</ul>
        ) : (
          byMonth(rows, today).map((group) => (
            <div key={group.label}>
              <h3 className="sticky top-0 z-10 flex items-baseline justify-between gap-3 border-b border-line-soft bg-surface-subtle px-4 py-2 text-micro font-semibold tracking-[0.08em] text-ink-2 uppercase md:px-5">
                {group.label}
                <span className="tracking-normal normal-case">
                  {pluralPayments(group.rows.length)} ·{" "}
                  <Money
                    amount={sum(group.rows.map((r) => r.expectedAmount))}
                    sign="none"
                    className="font-bold text-ink"
                  />
                </span>
              </h3>
              <ul>{group.rows.map(item)}</ul>
            </div>
          ))
        )}
      </div>
      {footnote && (
        <p className="shrink-0 border-t border-line-soft px-4 py-3 text-meta text-ink-2 md:px-5">
          {footnote}
        </p>
      )}
    </section>
  );
}

/**
 * Phones: the date, the name and the amount on the first line, the timing and
 * details on the second, Pay and Skip on the third. From md: the actions move
 * to the end of the row.
 */
function PendingItem({
  row,
  accounts,
  today,
  attention,
}: {
  readonly row: PendingRow;
  readonly accounts: readonly Choice[];
  readonly today: CalendarDate;
  readonly attention: boolean;
}) {
  const details = [row.categoryName, row.accountName && `usually from ${row.accountName}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-line-soft px-4 py-3 last:border-b-0 md:grid-cols-[2.75rem_minmax(0,1fr)_auto_auto] md:px-5">
      <DateTile date={row.dueOn} timing={row.timing} className="row-span-2 md:row-span-2" />
      <p className="col-start-2 row-start-1 min-w-0 self-end truncate font-semibold text-ink">
        {row.name}
        <span className="sr-only">, due {longDate(row.dueOn)}</span>
      </p>
      <p className="col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 self-start text-meta text-ink-2">
        <Timing row={row} today={today} />
        {details && <span className="min-w-0 truncate">{details}</span>}
      </p>
      <p className="col-start-3 row-start-1 self-end text-right md:row-span-2 md:self-center">
        <Money
          amount={row.expectedAmount}
          sign="none"
          className="text-body font-semibold text-ink"
        />
        <span className="sr-only"> expected</span>
      </p>
      <div className="col-[2/-1] row-start-3 md:col-start-4 md:row-span-2 md:row-start-1">
        <OccurrenceActions
          occurrence={{
            id: row.id,
            name: row.name,
            dueOn: row.dueOn,
            expectedAmount: row.expectedAmount,
            expectedAccountId: row.expectedAccountId,
            categoryName: row.categoryName,
          }}
          accounts={accounts}
          today={today}
          emphasized={attention}
        />
      </div>
    </li>
  );
}

/** Overdue and due today are statuses (icon + word + colour); upcoming is plain timing. */
function Timing({ row, today }: { readonly row: PendingRow; readonly today: CalendarDate }) {
  const phrase = timingPhrase(row.dueOn, today, row.timing);
  if (row.timing === "overdue") {
    return <OverdueTag>{phrase}</OverdueTag>;
  }
  if (row.timing === "due_today") {
    return (
      <Tag tone="info" icon={<CalendarClock aria-hidden className="size-3.5" />}>
        {phrase}
      </Tag>
    );
  }
  return <span className="whitespace-nowrap">{phrase}</span>;
}

/** A calendar leaf: the day large, the month small. Decorative; the row states the date. */
export function DateTile({
  date,
  muted = false,
  timing = "upcoming",
  className,
}: {
  readonly date: CalendarDate;
  readonly muted?: boolean;
  /** Overdue: warning ink on white; due today: mist and ocean, as its tag. */
  readonly timing?: PendingTiming;
  readonly className?: string;
}) {
  const { month, day } = toParts(date);
  return (
    <span
      aria-hidden
      title={shortDate(date)}
      className={cn(
        "grid size-11 shrink-0 place-content-center rounded-control text-center",
        timing === "overdue"
          ? "bg-surface text-warning shadow-[inset_0_0_0_1.5px_var(--color-warning)]"
          : timing === "due_today"
            ? "bg-mist text-ocean shadow-[inset_0_0_0_1.5px_var(--color-ocean)]"
            : muted
              ? "bg-surface-subtle text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]"
              : "bg-surface text-navy shadow-[inset_0_0_0_1px_var(--color-line)]",
        className,
      )}
    >
      <span className="text-heading leading-none font-bold">{day}</span>
      <span className="mt-0.5 text-micro leading-none font-semibold tracking-wide uppercase">
        {MONTHS[month - 1]}
      </span>
    </span>
  );
}
