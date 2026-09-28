import { CalendarClock, CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { toParts, type CalendarDate } from "@/domain/calendar-date";
import type { PendingTiming } from "@/domain/commitments/occurrences";
import type { Money as MoneyValue } from "@/domain/money";

import { longDate, shortDate } from "../format";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { Tag } from "../ui/panel";
import type { Choice } from "./commitment-panel";
import { timingPhrase } from "./describe";
import { OccurrenceActions } from "./occurrence-actions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A Commitments card: white, hairline edge, a soft lift (as on Accounts and Cash flow). */
export const CARD = "overflow-clip rounded-panel border border-line bg-surface shadow-card";

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
}: {
  readonly id: string;
  readonly title: string;
  readonly note: ReactNode;
  readonly rows: readonly PendingRow[];
  readonly empty: ReactNode;
  readonly accounts: readonly Choice[];
  readonly today: CalendarDate;
  readonly attention: boolean;
}) {
  return (
    <section aria-labelledby={id} className={CARD}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-3 md:px-5">
        <h2 id={id} className="text-heading font-semibold text-navy">
          {title}
        </h2>
        <p className="text-meta text-ink-2">{note}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-body text-ink-2 md:px-5">{empty}</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <PendingItem
              key={row.id}
              row={row}
              accounts={accounts}
              today={today}
              attention={attention}
            />
          ))}
        </ul>
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
    <li className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 last:border-b-0 md:grid-cols-[2.75rem_minmax(0,1fr)_auto_auto] md:px-5">
      <DateTile date={row.dueOn} className="row-span-2 md:row-span-2" />
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
    return (
      <Tag tone="warning" icon={<CircleAlert aria-hidden className="size-3.5" />}>
        {phrase}
      </Tag>
    );
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
  className,
}: {
  readonly date: CalendarDate;
  readonly muted?: boolean;
  readonly className?: string;
}) {
  const { month, day } = toParts(date);
  return (
    <span
      aria-hidden
      title={shortDate(date)}
      className={cn(
        "grid size-11 shrink-0 place-content-center rounded-control border border-line text-center",
        muted ? "bg-surface-subtle text-ink-2" : "bg-surface text-navy",
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
