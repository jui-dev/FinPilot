import { CalendarClock, CircleAlert, ListChecks } from "lucide-react";

import type { CalendarDate } from "@/domain/calendar-date";
import type { Money as MoneyValue } from "@/domain/money";

import { dayLabel, shortDate } from "../format";
import { Money } from "../ui/money";
import { Tag } from "../ui/panel";
import { noneThrough, pluralPayments } from "./describe";

export interface NextDue {
  readonly name: string;
  readonly dueOn: CalendarDate;
  readonly amount: MoneyValue;
}

/**
 * "What needs my attention, and what is coming?" — the outcome, before the
 * rows behind it: what is overdue or due today (the only part that asks for a
 * decision now), what falls due over the coming weeks, and the next one.
 * The lists below hold the evidence; no total is repeated there.
 */
export function CommitmentsSummary({
  attention,
  comingUp,
  through,
  next,
  today,
}: {
  readonly attention: {
    readonly total: MoneyValue;
    readonly count: number;
    readonly overdue: number;
  };
  readonly comingUp: { readonly total: MoneyValue; readonly count: number };
  /** The last day occurrences are known for. */
  readonly through: CalendarDate;
  readonly next: NextDue | null;
  readonly today: CalendarDate;
}) {
  const dueToday = attention.count - attention.overdue;
  return (
    <section
      aria-label="At a glance"
      className="grid overflow-clip rounded-panel border border-line bg-surface shadow-card md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
    >
      <div className="bg-mist px-5 py-5 md:px-7 md:py-6">
        <h2 className="text-body font-semibold text-navy">Due now</h2>
        {attention.count > 0 ? (
          <>
            <p className="mt-1 text-display font-bold text-navy">
              <Money amount={attention.total} sign="none" />
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-body text-ink-2">
              {attention.overdue > 0 && (
                <Tag tone="warning" icon={<CircleAlert aria-hidden className="size-3.5" />}>
                  {attention.overdue} overdue
                </Tag>
              )}
              {dueToday > 0 && (
                <Tag tone="info" icon={<CalendarClock aria-hidden className="size-3.5" />}>
                  {dueToday} due today
                </Tag>
              )}
              <span>Pay or skip each one below.</span>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-display font-bold text-navy">All clear</p>
            <p className="mt-1 text-body text-ink-2">Nothing is overdue or due today.</p>
          </>
        )}
      </div>
      {/* Phones: side by side under the outcome. md and up: stacked beside it. */}
      <dl className="grid grid-cols-2 divide-x divide-line border-t border-line md:grid-cols-1 md:divide-x-0 md:divide-y md:border-t-0 md:border-l">
        <Fact term="Coming up" icon={ListChecks}>
          <span className="text-figure font-bold text-navy">
            <Money amount={comingUp.total} sign="none" />
          </span>
          <span className="text-meta text-ink-2">
            {comingUp.count === 0 ? "Nothing due" : pluralPayments(comingUp.count)} through{" "}
            <span className="whitespace-nowrap">{shortDate(through, today)}</span>
          </span>
        </Fact>
        <Fact term="Next due" icon={CalendarClock}>
          {next ? (
            <>
              <span className="truncate text-figure font-bold text-navy">{next.name}</span>
              <span className="text-meta text-ink-2">
                {dayLabel(next.dueOn, today)} · <Money amount={next.amount} sign="none" />
              </span>
            </>
          ) : (
            // Only the forecast window is known: a later one may still fall due.
            <span className="text-body text-ink-2">{noneThrough(through, today)}</span>
          )}
        </Fact>
      </dl>
    </section>
  );
}

function Fact({
  term,
  icon: Icon,
  children,
}: {
  readonly term: string;
  readonly icon: typeof ListChecks;
  readonly children: React.ReactNode;
}) {
  return (
    // Label over value until the column is wide enough for one row (lg), so
    // neither wraps at tablet widths.
    <div className="flex min-w-0 flex-col gap-1.5 px-4 py-4 md:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
      <dt className="flex items-center gap-2 text-body font-semibold whitespace-nowrap text-ink-2">
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-mist text-ocean"
        >
          <Icon className="size-4" strokeWidth={2} />
        </span>
        {term}
      </dt>
      <dd className="flex min-w-0 flex-col gap-0.5 lg:items-end lg:text-right">{children}</dd>
    </div>
  );
}
