import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { yearMonthOf, type YearMonth } from "@/domain/calendar-date";
import type { MonthCalendar } from "@/server/services/calendar-service";

import { cashFlowHref } from "../activity/links";
import { CARD } from "../cash-flow/labels";
import { monthLabel } from "../format";
import { linkClass } from "../ui/button";
import { cn } from "../ui/cn";
import { Money } from "../ui/money";
import { calendarHref, dayMonth } from "./describe";

/** The month shown, with the months either side that can be shown. */
export function CalendarMonthSwitcher({ calendar }: { readonly calendar: MonthCalendar }) {
  const { months, month } = calendar;
  const index = months.indexOf(month);
  return (
    <div className={cn(CARD, "flex items-center p-1")}>
      <MonthLink month={months[index + 1]} direction="previous" />
      <h2
        id="calendar-month"
        className="min-w-0 flex-1 px-2 text-center text-body font-bold text-navy md:w-44 md:flex-none"
      >
        {monthLabel(month)}
      </h2>
      <MonthLink month={index > 0 ? months[index - 1] : undefined} direction="next" />
    </div>
  );
}

function MonthLink({
  month,
  direction,
}: {
  readonly month: YearMonth | undefined;
  readonly direction: "previous" | "next";
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const name = direction === "previous" ? "Previous month" : "Next month";
  const className =
    "grid size-10 shrink-0 place-items-center rounded-control text-navy transition-colors";
  if (!month) {
    return (
      <span aria-disabled="true" aria-label={name} className={cn(className, "opacity-30")}>
        <Icon aria-hidden className="size-5" />
      </span>
    );
  }
  return (
    <Link
      href={calendarHref(month)}
      aria-label={`${name}: ${monthLabel(month)}`}
      className={cn(className, "hover:bg-mist")}
    >
      <Icon aria-hidden className="size-5" />
    </Link>
  );
}

/**
 * "How is this month going?" The same card as Trends' and Cash flow's totals:
 * what was recorded (Cash flow's figures, to date) in two panels, and apart
 * from it, on mist, what is known to fall due. A future month has no recorded
 * money, only its payments due.
 */
export function MonthLine({ calendar }: { readonly calendar: MonthCalendar }) {
  const { summary, due, when, month, today, horizon } = calendar;
  const lastScheduledMonth = yearMonthOf(horizon) === month;
  const showDue = due.pendingCount > 0 || when === "future";
  return (
    <section aria-labelledby="calendar-summary" className={cn(CARD, "p-5 md:p-7")}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 id="calendar-summary" className="text-heading font-bold text-navy">
            {when === "current" ? `${monthLabel(month).split(" ")[0]} so far` : monthLabel(month)}
          </h2>
          <p className="mt-1 text-meta text-ink-2">
            What was recorded, and what is still to pay.
            {lastScheduledMonth && <> Payments are scheduled through {dayMonth(horizon)}.</>}
          </p>
        </div>
        {summary && (
          <Link
            href={cashFlowHref(month, yearMonthOf(today))}
            className={cn(
              "inline-flex items-center gap-1 text-meta font-medium text-ocean",
              linkClass,
            )}
          >
            Open in Cash flow
            <ChevronRight aria-hidden className="size-3.5" />
          </Link>
        )}
      </div>

      <div
        className={cn("mt-5 grid gap-3 lg:gap-2.5", showDue ? "md:grid-cols-3" : "md:grid-cols-2")}
      >
        {summary ? (
          <>
            <Panel term="Came in">
              {/* As Cash flow writes Came in: a plain amount, its heading says the direction. */}
              <Money amount={summary.income} sign="negative" />
            </Panel>
            <Panel term="Went out">
              <Money amount={summary.spending} />
            </Panel>
          </>
        ) : (
          <p className="rounded-[12px] bg-surface-subtle px-4 py-3.5 text-body text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line-soft)] md:col-span-2">
            Nothing has come in or gone out yet
          </p>
        )}
        {showDue && (
          <Panel
            term={
              when === "past"
                ? "Not paid or skipped"
                : when === "future"
                  ? "Due this month"
                  : "Still due this month"
            }
            note={due.pendingCount === 1 ? "1 payment" : `${due.pendingCount} payments`}
            mist
          >
            <Money amount={due.pendingTotal} />
          </Panel>
        )}
      </div>
    </section>
  );
}

/** One figure on its own panel: sand for what was recorded, mist for what is still to pay. */
function Panel({
  term,
  note,
  mist = false,
  children,
}: {
  readonly term: string;
  readonly note?: string;
  readonly mist?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-[12px] px-4 py-3.5",
        mist
          ? "bg-mist/35 shadow-[inset_0_0_0_1px_rgb(70_103_141/0.14)]"
          : "bg-surface-subtle shadow-[inset_0_0_0_1px_var(--color-line-soft)]",
      )}
    >
      <dl>
        <div>
          <dt
            className={cn(
              "text-micro font-semibold tracking-[0.08em] uppercase",
              mist ? "text-ocean" : "text-ink-2",
            )}
          >
            {term}
          </dt>
          <dd className="mt-1 text-figure font-bold whitespace-nowrap text-navy tabular-nums md:text-[1.75rem] md:leading-tight">
            {children}
          </dd>
        </div>
      </dl>
      {note && <p className="mt-1.5 text-meta text-ink-2">{note}</p>}
    </div>
  );
}
